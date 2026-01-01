import { type SerializedDiffOptions } from '@vitest/utils/diff';
import { MessagePort } from 'node:worker_threads';

import type {
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  BinaryDebugInfo,
  CoverageData,
  DiscoveredTest,
  DiscoveredTests,
  ExecuteTestResult,
  ExecuteTestResultRef,
  ResolvedAssemblyScriptPoolOptions,
  TestExecutionEnd,
  TestExecutionStart,
} from '../types/types.js';
import { POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import { createMemory } from './wasm-memory.js';
import { createDiscoveryImports, createTestExecutionImports } from './wasm-imports.js';
import { enhanceTestErrorOnResult, sourceMapAndParseWASMStack } from './wasm-errors.js';
import { createPoolError, createPoolErrorFromAnyError, getTestErrorFromAnyError } from '../util/pool-errors.js';
import { parseSourceMap } from './source-maps.js';

function createExecutorPoolError(
  testFileBasename: string,
  context: string,
  reason: string,
  cause?: any,
): AssemblyScriptPoolError {
  return createPoolError(
    `${testFileBasename} - ${context} failure in executor: ${reason}`,
    POOL_ERROR_NAMES.WASMExecutionHarnessError,
    undefined,
    cause
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
  sourceMap: string,
  testFileBasename: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  defaultTestOptions: AssemblyScriptTestOptions,
  isBinaryInstrumented: boolean,
  handleLog: AssemblyScriptConsoleLogHandler,
): Promise<{ tests: DiscoveredTests }> {
  const tests: DiscoveredTests = {};
  const module = await WebAssembly.compile(binary as BufferSource);
  const memory = createMemory();

  // Create coverage memory matching instrumentation expections (from user config).
  // While this memory will not be used, discovery instantiates the same binary,
  // and WebAssembly.Instance will throw if the expected memory sizes don't match
  const coverageMemory = isBinaryInstrumented ?
    new WebAssembly.Memory({
      initial: poolOptions.coverageMemoryPagesMin,
      maximum: poolOptions.coverageMemoryPagesMax
    })
    : undefined;

  const importObject = createDiscoveryImports(memory, tests, defaultTestOptions, handleLog, coverageMemory);

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level code (registers tests via callbacks)
  if (typeof exports._start === 'function') {
    try {
      exports._start();
    } catch (error) {
      const thrownErrAny: any = error as any;

      // error came from the abort() handler
      if (thrownErrAny?.name === POOL_ERROR_NAMES.WASMExecutionAbortError) {

        // for test *discovery* abort, test error comes from PoolError's `cause`
        if (Object.values(TEST_ERROR_NAMES).includes(thrownErrAny?.cause?.name)) {
          const reportableTestError = thrownErrAny.cause as AssemblyScriptTestError;
          
          // special handing for discovery's abort() handler
          // it includes the rawErrorStack directly on the test error
          if (reportableTestError.rawCallStack) {
            const smObj = parseSourceMap(sourceMap);
            reportableTestError.stacks = await sourceMapAndParseWASMStack(reportableTestError.rawCallStack as NodeJS.CallSite[], smObj, false);

            // delete the raw stack so vitest doesn't complain about unexpected error values
            delete reportableTestError.rawCallStack;
          }

          throw createExecutorPoolError(
            testFileBasename,
            'discoverTests',
            `Unexpected discovery error - ${reportableTestError.name}: ${reportableTestError.message}`,
            reportableTestError
          );
        }
      } else {
        throw createPoolErrorFromAnyError(
          'Unexpected discovery error',
          POOL_ERROR_NAMES.WASMExecutionHarnessError,
          error
        );
      }
    }
  } else {
    throw createExecutorPoolError(testFileBasename, 'discoverTests', 'no _start() export');
  }

  debug('[Executor] Discovered', Object.keys(tests).length, 'tests');
  return { tests };
}

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
  workerStart: number,
  workerStartPerf: number,
  test: DiscoveredTest,
  testFileBasename: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  collectCoverage: boolean,
  binary: Uint8Array,
  sourceMap: string,
  port: MessagePort,
  handleLog: AssemblyScriptConsoleLogHandler,
  debugInfo?: BinaryDebugInfo,
  diffOptions?: SerializedDiffOptions,
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

  // Mutable reference for imported functions to update
  const testResultRef: ExecuteTestResultRef = { value: null };

  // Create import object with pool-side functions for capturing test execution results
  const importObject = createTestExecutionImports(memory, testResultRef, handleLog, coverageMemory);

  // Instantiate fresh WASM instance for this test
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level code. Test registration is stubbed/noop duing execution,
  // but this call is still needed to initialize any user-defined globals / other top level code.
  if (typeof exports._start === 'function') {
    // Not explicitly handling with try-catch here because failures in _start should be
    // caught during discovery and source-mapped. If this somehow fails, the worker still catches it.
    exports._start();
  } else {
    throw createExecutorPoolError(testFileBasename, 'executeTest', 'no _start() export');
  }

  let testFn: (() => void) | null | undefined;

  // Get the test function to execute via function table
  // (accessable because we're using the AS compiler --exportTable flag)
  const table = exports.table as WebAssembly.Table | undefined;
  
  if (table && typeof table.get === 'function') {
    testFn = table.get(test.fnIndex) as (() => void) | null;

    if (!testFn) {
      throw createExecutorPoolError(
        testFileBasename,
        'executeTest',
        `Test function at index ${test.fnIndex} not found in function table`
      );
    }
  } else {
    throw createExecutorPoolError(
      testFileBasename,
      'executeTest',
      'Function table not found in WASM exports (missing --exportTable flag?)'
    );
  }

  // Create an ExecuteTestResult to hold the result. This ref is updated from within WASM
  // via the imported __assertion_pass(), __assertion_fail(), and abort() functions
  testResultRef.value = {
    name: test.name,
    passed: true,
    timedOut: false,
    assertionsPassed: 0,
    assertionsFailed: 0,
  };

  let executionStartPerf: number | undefined;

  // try-catch to ensure we capture known test errors to report
  // as AssemblyScriptTestErrors to vitest
  try {
    testResultRef.value.startTime = Date.now();
    
    const testTiming: TestExecutionStart = {
      executionStart: testResultRef.value.startTime,
      workerStart,
      workerOverhead: performance.now() - workerStartPerf
    };
    port.postMessage(testTiming);

    executionStartPerf = performance.now();

    // Execute this test
    testFn();

    // If we reach here, test passed, i.e. No abort occurred.
    // Proceed below to prepare the test result
  } catch (error) {
    const thrownErrAny = error as any;
    let reportableTestError: AssemblyScriptTestError | undefined;

    // If this is NOT a WASMExecutionAbort error, it means it did NOT originate from the
    // wasm abort() import and is unexpected, so we throw as a PoolError.
    //
    // If this IS a WASMExecutionAbort error, it means the wasm abort() import threw it as a
    // known test error (assertion or wasm runtime), so we continue to prepare the test result 
    const isUnexpectedError = thrownErrAny?.name !== POOL_ERROR_NAMES.WASMExecutionAbortError;

    if (isUnexpectedError) {
      throw createExecutorPoolError(
        testFileBasename,
        'executeTest',
        `Unexpected execution error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
        (error as any)?.cause
      );
    } else {
      // for test *execution* abort, test error comes from the test result as testResultRef.value.error
      reportableTestError = testResultRef.value?.error;

      // this should not happen, but let's be defensive
      if (!reportableTestError) {
        reportableTestError = {
          message: `Unknown execution abort ${typeof thrownErrAny?.cause === 'string' ? thrownErrAny.cause : thrownErrAny?.stack}`,
          name: TEST_ERROR_NAMES.WASMRuntimeError,
          cause: getTestErrorFromAnyError(error, 'Unknown execution abort', POOL_ERROR_NAMES.WASMExecutionHarnessError)
        };
      }
    }
  }

  testResultRef.value.duration = performance.now() - executionStartPerf!;
  
  // notify the pool so it doesn't abort because of a test timeout
  const testTiming: TestExecutionEnd = { executionEnd: Date.now() };
  port.postMessage(testTiming);

  // If error is present, apply source mapping to make stack locations
  // useful, and add nicely-formatted diffs for reporting through vitest
  if (testResultRef.value.error) {
    await enhanceTestErrorOnResult(testResultRef.value, sourceMap, diffOptions);
  }

  // Extract coverage hits from coverage memory
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
