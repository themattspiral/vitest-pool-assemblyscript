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

import type { ExecuteTestResult, CoverageData, DiscoveredTest, DiscoveredTests, BinaryDebugInfo, AssemblyScriptTestError, ResolvedAssemblyScriptPoolOptions } from '../types.js';
import { AssemblyScriptPoolError, POOL_ERROR_NAMES } from '../types.js';
import { debug } from '../util/debug.js';
import { createMemory } from './wasm-memory.js';
import { createDiscoveryImports, createTestExecutionImports } from './wasm-imports.js';
import { enhanceErrorWithSourceMap } from './errors.js';

function createExecutorError(testFileBasename: string, context: string, reason: string): AssemblyScriptPoolError {
  return new AssemblyScriptPoolError(
    `${testFileBasename} - ${context} failure in executor: ${reason}`,
    POOL_ERROR_NAMES.WASMExecutionHarnessError,
  );
}

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
  testFileBasename: string,
): Promise<{ tests: DiscoveredTests }> {
  const tests: DiscoveredTests = {};
  const module = await WebAssembly.compile(binary as BufferSource);
  const memory = createMemory();

  // stub coverage memory for discovery
  const coverageMemory = new WebAssembly.Memory({ initial: 1, maximum: 1 });

  const importObject = createDiscoveryImports(memory, tests, coverageMemory);

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level code (registers tests via callbacks)
  if (typeof exports._start === 'function') {
    exports._start();
  } else {
    throw createExecutorError(testFileBasename, 'discoverTests', 'no _start() export');
  }

  debug('[Executor] Discovered', Object.keys(tests).length, 'tests');
  return { tests };
}

// ============================================================================
// Public Exports - Single Test Execution
// ============================================================================

/**
 * Execute a single test with crash isolation
 *
 * @param binary - Compiled WASM binary (clean for dual-mode, instrumented for single-mode)
 * @param test - Test to execute (name and function index)
 * @param sourceMap - Source map JSON string (optional)
 * @param collectCoverage - Whether to collect coverage during execution
 * @param debugInfo - Debug info from coverage instrumentation (required if collectCoverage is true)
 * @returns Test result with outcome, timing, and optional coverage
 */
export async function executeTest(
  test: DiscoveredTest,
  testFileBasename: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  collectCoverage: boolean,
  binary: Uint8Array,
  sourceMap: string,
  debugInfo?: BinaryDebugInfo,
): Promise<ExecuteTestResult> {

  // Compile the binary to usable WASM module
  const module = await WebAssembly.compile(binary as BufferSource);

  // Create fresh memory for this test instance
  const memory = createMemory();

  // Create coverage memory if collecting coverage (instrumented binary)
  const coverageMemory = collectCoverage ?
    new WebAssembly.Memory({
      initial: poolOptions.coverageMemoryPagesMin,
      maximum: poolOptions.coverageMemoryPagesMax
    })
    : undefined;

  // Mutable reference for import callbacks to update
  const testResultRef: { value: ExecuteTestResult | null } = { value: null };

  // Create import object with appropriate callbacks
  const importObject = createTestExecutionImports(memory, testResultRef, coverageMemory);

  // Instantiate fresh WASM instance for this test
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level code. Test registration is stubbed/noop duing execution,
  // but this call is still needed to initialize any user-defined globals / other top level code.
  if (typeof exports._start === 'function') {
    exports._start();
  } else {
    throw createExecutorError(testFileBasename, 'executeTest', 'no _start() export');
  }

  // Execute this specific test
  try {
    const startTime = Date.now();
    testResultRef.value = {
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
        throw createExecutorError(
          testFileBasename,
          'executeTest',
          `Test function at index ${test.fnIndex} not found in function table`
        );
      }

      testFn();
    } else {
      throw createExecutorError(
        testFileBasename,
        'executeTest',
        'Function table not found in WASM exports (missing --exportTable flag?)'
      );
    }

    // Calculate duration
    const endTime = Date.now();
    testResultRef.value.duration = endTime - startTime;
    
    debug(`[Executor] Test "${test.name}": executed in ${testResultRef.value.duration}ms`);

    // If we reach here, test passed (no abort occurred)

  } catch (error) {
    debug('[Executor] Error during test execution:', error);
    // Error should be captured in currentTestRef.value via abort handler
    if (testResultRef.value !== null) {
      // Calculate duration even on error
      if (testResultRef.value.startTime && !testResultRef.value.duration) {
        testResultRef.value.duration = Date.now() - testResultRef.value.startTime;
      }

      // If abort() is called (either intentionally by a failed assertion or automatically 
      // for a runtime exception) it will set test.passed=false and test.error=Some_TestError.
      // In case of unexpected execution error where no abort handler is called (func table issuie), mark test failed here.
      if (testResultRef.value.passed) {
        testResultRef.value.passed = false;
        const err: AssemblyScriptTestError = {
          name: POOL_ERROR_NAMES.WASMRuntimeError,
          message: error instanceof Error ? error.message : String(error)
        };
        testResultRef.value.error = err;
      }
    }
  }

  // Handle test result: source mapping and coverage
  let finalResult: ExecuteTestResult;
  if (testResultRef.value) {
    const testResult = testResultRef.value;

    // If error is present (rawCallStack), apply source mapping to make it useful
    if (testResult.rawCallStack) {
      await enhanceErrorWithSourceMap(testResult, sourceMap);
    }

    // Extract coverage from memory if collecting coverage
    if (collectCoverage) {
      if (!coverageMemory) {
        throw createExecutorError(
          testFileBasename,
          'executeTest',
          'Coverage memory not created despite collectCoverage=true'
        );
      }

      if (!debugInfo) {
        throw createExecutorError(
          testFileBasename,
          'executeTest',
          'debugInfo is required when collectCoverage=true'
        );
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
          debug(`[Executor] Extracting hits for source file: "${filePath}"`);
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
        name: POOL_ERROR_NAMES.WASMRuntimeError,
        message: 'Test crashed during initialization'
      },
      assertionsPassed: 0,
      assertionsFailed: 0,
      coverage: undefined,
    };
  }

  return finalResult;
}
