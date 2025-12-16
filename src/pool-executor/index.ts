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

import type {
  AssemblyScriptTestError,
  BinaryDebugInfo,
  CoverageData,
  DiscoveredTest,
  DiscoveredTests,
  ExecuteTestResult,
  ResolvedAssemblyScriptPoolOptions
} from '../types/types.js';
import { AssemblyScriptPoolError } from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID, POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import { createMemory } from './wasm-memory.js';
import { createDiscoveryImports, createTestExecutionImports } from './wasm-imports.js';
import { enhanceErrorWithSourceMap } from './errors.js';
import { createPoolErrorFromError } from '../util/pool-errors.js';

function createExecutorPoolError(testFileBasename: string, context: string, reason: string): AssemblyScriptPoolError {
  return createPoolErrorFromError(
    `${testFileBasename} - ${context} failure in executor`,
    POOL_ERROR_NAMES.WASMExecutionHarnessError,
    reason
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
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  isBinaryInstrumented: boolean,
): Promise<{ tests: DiscoveredTests }> {
  const tests: DiscoveredTests = {};
  const module = await WebAssembly.compile(binary as BufferSource);
  const memory = createMemory();

  // Create coverage memory matching instrumentation expections (from user config).
  // While this memory will not be used, discovery uses the same instrumented binary,
  // and WebAssembly.Instance will throw if the expected memory sizes don't match
  const coverageMemory = isBinaryInstrumented ?
    new WebAssembly.Memory({
      initial: poolOptions.coverageMemoryPagesMin,
      maximum: poolOptions.coverageMemoryPagesMax
    })
    : undefined;

  const importObject = createDiscoveryImports(memory, tests, coverageMemory);

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level code (registers tests via callbacks)
  if (typeof exports._start === 'function') {
    exports._start();
  } else {
    throw createExecutorPoolError(testFileBasename, 'discoverTests', 'no _start() export');
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
    throw createExecutorPoolError(testFileBasename, 'executeTest', 'no _start() export');
  }

  // Execute this specific test
  try {
    const startTime = performance.now();
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
        throw createExecutorPoolError(
          testFileBasename,
          'executeTest',
          `Test function at index ${test.fnIndex} not found in function table`
        );
      }

      testFn();
    } else {
      throw createExecutorPoolError(
        testFileBasename,
        'executeTest',
        'Function table not found in WASM exports (missing --exportTable flag?)'
      );
    }

    // Calculate duration
    const endTime = performance.now();
    testResultRef.value.duration = endTime - startTime;
    
    debug(`[Executor] Test "${test.name}": executed in ${testResultRef.value.duration.toFixed(2)}ms`);

    // If we reach here, test passed (no abort occurred)

  } catch (error) {
    const anyErr = error as any;

    // abort handler wasm import threw this error so it means it was a known test error path (assertion/wasm runtime)
    if (anyErr?.__type === ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID && anyErr?.name === POOL_ERROR_NAMES.WASMExecutionAbort) {
      // testResultRef.value.error will be set by test execution abort() import
      let testError: AssemblyScriptTestError | undefined = testResultRef.value?.error;

      // the error's cause will be set to the error message for test discovery abort() import
      if (!testError) {
        testError = {
          message: typeof anyErr?.cause === 'string' ? anyErr.cause : anyErr?.stack || 'Unknown execution abort',
          name: TEST_ERROR_NAMES.WASMRuntimeError
        };
      }
    }
    
    // unexpected error while executing, so throw it rather than reporting
    else {
      const err = createExecutorPoolError(
        testFileBasename,
        'executeTest',
        `Unexpected exection error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
      );
      err.cause = (error as any)?.cause;

      throw err;
    }
  }

  // set all test result values
  if (testResultRef.value === null) {
    throw createExecutorPoolError(
      testFileBasename,
      'executeTest',
      `Unexpected exection error: testResultRef.value is undefined after test execution`
    );
  }

  // Calculate duration even on error
  if (testResultRef.value.startTime) {
    testResultRef.value.duration = performance.now() - testResultRef.value.startTime;
  }

  // If error is present (rawCallStack), apply source mapping to make it useful
  if (testResultRef.value.rawCallStack) {
    await enhanceErrorWithSourceMap(testResultRef.value, sourceMap);
  }

  // Extract coverage from memory if collecting coverage
  if (collectCoverage) {
    if (!coverageMemory) {
      throw createExecutorPoolError(
        testFileBasename,
        'executeTest',
        'Coverage memory not created despite collectCoverage=true'
      );
    }

    if (!debugInfo) {
      throw createExecutorPoolError(
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

    testResultRef.value.coverage = coverage;
    debug(`[Executor] Extracted coverage data: ${functionsHit} functions hit`);
  }

  return testResultRef.value;
}
