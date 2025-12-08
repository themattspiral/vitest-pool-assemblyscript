/**
 * WASM Test Executor - Per-Test Execution
 *
 * Provides clean interfaces for per-test parallelism:
 * - Test discovery (query test registry)
 * - Single test execution (with crash isolation)
 * - Coverage collection (for dual-mode coverage)
 * - WASM import object creation
 * - Error source location mapping (V8 stack traces + source maps)
 */

import type { RawSourceMap } from 'source-map';

import type { TestResult, CoverageData, DiscoveredTest, DiscoveredTests, BinaryDebugInfo } from '../types.js';
import { COVERAGE_MEMORY_PAGES_MAX, COVERAGE_MEMORY_PAGES_MIN, ERROR_NAMES } from '../types.js';
import { debug } from '../utils/debug.mjs';
import { createMemory } from './wasm-memory.js';
import { createDiscoveryImports, createTestExecutionImports } from './wasm-imports.js';
import { enhanceErrorWithSourceMap } from './errors.js';

// ============================================================================
// Public Exports - Test Discovery
// ============================================================================

/**
 * Discover tests via registration callbacks
 *
 * Process:
 * 1. Instantiate WASM with import callbacks
 * 2. Call _start() to run top-level code
 * 3. test() calls invoke __register_test callback with name and function index
 * 4. Return array of test objects with names and function indices
 *
 * Note: If the binary is instrumented (integrated/failsafe modes), we must provide
 * a stub coverage memory even though we're not collecting coverage during discovery.
 *
 * @param binary - Compiled WASM binary (may be instrumented)
 * @param debugInfo - Optional debug info (presence indicates instrumented binary)
 * @returns Discovery result with tests array
 */
export async function discoverTests(
  binary: Uint8Array,
  debugInfo?: BinaryDebugInfo
): Promise<{ tests: DiscoveredTests }> {
  const tests: DiscoveredTests = {};
  const module = await WebAssembly.compile(binary as BufferSource);
  const memory = createMemory();

  // If binary is instrumented (has debugInfo), provide stub coverage memory
  const coverageMemory = debugInfo
    ? new WebAssembly.Memory({ initial: COVERAGE_MEMORY_PAGES_MIN, maximum: COVERAGE_MEMORY_PAGES_MAX })
    : undefined;

  const importObject = createDiscoveryImports(memory, tests, coverageMemory);

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level code (registers tests via callbacks)
  if (typeof exports._start === 'function') {
    exports._start();
  }

  debug('[Executor] Discovered', tests.length, 'tests');
  return { tests };
}

// ============================================================================
// Public Exports - Single Test Execution
// ============================================================================

/**
 * Execute a single test with crash isolation
 *
 * Runs one test in a fresh WASM instance for maximum safety.
 *
 * @param binary - Compiled WASM binary (clean for dual-mode, instrumented for single-mode)
 * @param test - Test to execute (name and function index)
 * @param sourceMap - Source map JSON string (optional)
 * @param collectCoverage - Whether to collect coverage during execution
 * @param debugInfo - Debug info from coverage instrumentation (required if collectCoverage is true)
 * @returns Test result with outcome, timing, and optional coverage
 */
export async function executeSingleTest(
  binary: Uint8Array,
  test: DiscoveredTest,
  sourceMap: string | undefined,
  collectCoverage: boolean,
  debugInfo?: BinaryDebugInfo
): Promise<TestResult> {

  // Compile the binary to usable WASM module
  const module = await WebAssembly.compile(binary as BufferSource);

  // Parse source map once (for error location mapping)
  const sourceMapJson: RawSourceMap | undefined = sourceMap ? JSON.parse(sourceMap) : undefined;
  if (sourceMapJson) {
    debug('[Executor] Source map available for error location mapping');
  }

  // Create fresh memory for this test instance
  const memory = createMemory();

  // Create coverage memory if collecting coverage (instrumented binary)
  const coverageMemory = collectCoverage ?
    new WebAssembly.Memory({ initial: COVERAGE_MEMORY_PAGES_MIN, maximum: COVERAGE_MEMORY_PAGES_MAX })
    : undefined;

  // Mutable reference for import callbacks to update
  const currentTestRef: { value: TestResult | null } = { value: null };

  // Create import object with appropriate callbacks
  const importObject = createTestExecutionImports(memory, currentTestRef, coverageMemory);

  // Instantiate fresh WASM instance for this test
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level code (stub registration, but needed to initialize any user-defined globals)
  if (typeof exports._start === 'function') {
    exports._start();
  }

  // Execute this specific test
  try {
    const startTime = Date.now();

    currentTestRef.value = {
      name: test.name,
      passed: true,
      assertionsPassed: 0,
      assertionsFailed: 0,
      startTime,
    };

    // Execute test function via function table (AS compiler --exportTable flag)
    const table = exports.table as WebAssembly.Table | undefined;
    if (table && typeof table.get === 'function') {
      const testFn = table.get(test.fnIndex) as (() => void) | null;
      if (!testFn) {
        throw new Error(`Test function at index ${test.fnIndex} not found in function table`);
      }
      testFn();
    } else {
      throw new Error('Function table not found in WASM exports (missing --exportTable flag?)');
    }

    // Calculate duration
    const endTime = Date.now();
    currentTestRef.value.duration = endTime - startTime;
    
    debug(`[Executor] Test "${test.name}": executed in ${currentTestRef.value.duration}ms`);

    // If we reach here, test passed (no abort occurred)

  } catch (error) {
    debug('[Executor] Error during test execution:', error);
    // Error should be captured in currentTestRef.value via abort handler
    if (currentTestRef.value !== null) {
      // Calculate duration even on error
      if (currentTestRef.value.startTime && !currentTestRef.value.duration) {
        currentTestRef.value.duration = Date.now() - currentTestRef.value.startTime;
      }

      // In case of unexpected execution error (no abort handler called), mark test failed
      if (currentTestRef.value.passed) {
        currentTestRef.value.passed = false;
        currentTestRef.value.error = {
          name: ERROR_NAMES.RuntimeError,
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }

  // Handle test result: source mapping and coverage
  let finalResult: TestResult;
  if (currentTestRef.value) {
    const testResult = currentTestRef.value;

    // If error is present (rawCallStack), apply source mapping to make it useful
    if (sourceMapJson && testResult.rawCallStack) {
      await enhanceErrorWithSourceMap(testResult, sourceMapJson);
    }

    // Extract coverage from memory if collecting coverage
    if (collectCoverage) {
      if (!coverageMemory) {
        throw new Error('Coverage memory not created despite collectCoverage=true');
      }
      if (!debugInfo) {
        throw new Error('debugInfo is required when collectCoverage=true');
      }

      const coverage: CoverageData = {
        hitCountsByFileAndPosition: {},
      };

      // Read counters from coverage memory
      const extractedHitCounters = new Uint32Array(coverageMemory.buffer, 0, debugInfo.instrumentedFunctionCount);
      debug(`[Executor] Read coverage memory for ${debugInfo.instrumentedFunctionCount} instrumented functions`);

      // Iterate all instrumented functions and build coverage data with hit counts extracted from coverage memory
      let functionsHit = 0;
      for (const [filePath, debugFunctions] of Object.entries(debugInfo.functionsByFileAndPosition)) {
        if (!coverage.hitCountsByFileAndPosition[filePath]) {
          coverage.hitCountsByFileAndPosition[filePath] = {};
          debug(`[Executor] Extracting hits for source file:`, filePath);
        }

        for (const [positionKey, funcInfo] of Object.entries(debugFunctions)) {
          if (funcInfo.coverageMemoryIndex === undefined) {
            debug(`[Executor]   Skipping hit extraction for function "${funcInfo.name}" (${positionKey}) - No coverageMemoryIndex (not instrumented)`);
            continue;
          }

          const hitCount = extractedHitCounters[funcInfo.coverageMemoryIndex] ?? 0;
          debug(`[Executor]   ${hitCount} hits [coverageMemoryIndex: ${funcInfo.coverageMemoryIndex}] for "${funcInfo.name}" at ${positionKey} `);

          if (coverage.hitCountsByFileAndPosition[filePath][positionKey] !== undefined) {
            debug(`[Executor]   WARNING: DUPLICATE POSITION "${funcInfo.name}" (${positionKey}) already extracted to coverage for ${filePath}`);
          }
          // Position key is already the position (line:column) from functionsByFileAndPosition
          coverage.hitCountsByFileAndPosition[filePath][positionKey] = hitCount;

          if (hitCount > 0) {
            functionsHit++;
          }
        }
      }

      testResult.coverage = coverage;
      debug(`[Executor] Extracted coverage data: ${functionsHit} functions hit`);
    }

    finalResult = testResult;
  } else {
    // Initialization crash (before test could start)
    finalResult = {
      name: test.name,
      passed: false,
      error: {
        name: ERROR_NAMES.RuntimeError,
        message: 'Test crashed during initialization'
      },
      assertionsPassed: 0,
      assertionsFailed: 0,
      coverage: undefined,
    };
  }

  return finalResult;
}
