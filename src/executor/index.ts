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

import { createMemory } from '../utils/wasm-memory.js';
import type { TestResult, CoverageData, DiscoveredTest, DebugInfo } from '../types.js';
import { COVERAGE_MEMORY_PAGES_MAX, ERROR_NAMES } from '../types.js';
import { debug, debugError } from '../utils/debug.mjs';
import { createDiscoveryImports, createTestExecutionImports } from './imports.js';
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
  debugInfo?: DebugInfo
): Promise<{ tests: DiscoveredTest[] }> {
  const tests: DiscoveredTest[] = [];
  const module = await WebAssembly.compile(binary as BufferSource);
  const memory = createMemory();

  // If binary is instrumented (has debugInfo), provide stub coverage memory
  const coverageMemory = debugInfo ? new WebAssembly.Memory({ initial: 1, maximum: COVERAGE_MEMORY_PAGES_MAX }) : undefined;

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
  debugInfo?: DebugInfo
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
  const coverageMemory = collectCoverage ? new WebAssembly.Memory({ initial: 1, maximum: COVERAGE_MEMORY_PAGES_MAX }) : undefined;

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
    
    debugError(`[Executor] Test "${test.name}": executed in ${currentTestRef.value.duration}ms`);

    // If we reach here, test passed (no abort occurred)

  } catch (error) {
    debugError('[Executor] Error during test execution:', error);
    // Error should be captured in currentTestRef.value via abort handler
    if (currentTestRef.value !== null) {
      // Calculate duration even on error
      if (currentTestRef.value.startTime && !currentTestRef.value.duration) {
        currentTestRef.value.duration = Date.now() - currentTestRef.value.startTime;
      }

      if (currentTestRef.value.passed) {
        // If not already marked as failed, mark it now
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
        positionCoverageByAbsoluteFilePath: {},
      };

      // Read counters from coverage memory
      const numFunctions = Object.keys(debugInfo.absoluteFilePathByQualifiedFunctionName).length;
      const counters = new Uint32Array(coverageMemory.buffer, 0, numFunctions);

      // Iterate all functions and build coverage data with hit counts
      // Use position-based keys (line:column) for stable merging across test files
      let functionsHit = 0;
      for (const [filePath, functions] of Object.entries(debugInfo.qualifiedFunctionsByAbsoluteFilePath)) {
        if (!coverage.positionCoverageByAbsoluteFilePath[filePath]) {
          coverage.positionCoverageByAbsoluteFilePath[filePath] = {};
        }

        for (const [qualifiedName, funcInfo] of Object.entries(functions)) {
          if (funcInfo.coverageMemoryIndex === undefined) {
            debug(`[Executor] Warning: function "${qualifiedName}" has no coverageMemoryIndex`);
            continue;
          }

          const hitCount = counters[funcInfo.coverageMemoryIndex] ?? 0;

          // Use position as key for stable merging (same source position = same function across compilations)
          const positionKey = `${funcInfo.startLine}:${funcInfo.startColumn}`;
          coverage.positionCoverageByAbsoluteFilePath[filePath][positionKey] = {
            info: funcInfo,
            hitCount,
          };

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
