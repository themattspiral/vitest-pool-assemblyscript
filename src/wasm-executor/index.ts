import type { SerializedDiffOptions } from '@vitest/utils/diff';
import type { File, Test } from '@vitest/runner/types';

import type {
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  AssemblyScriptTestTaskMeta,
  CachedCompilation,
  CoverageData,
  ResolvedAssemblyScriptPoolOptions,
  WASMExecutorPerfTimings,
} from '../types/types.js';
import { POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import { createMemory } from './wasm-memory.js';
import { createDiscoveryImports, createTestExecutionImports } from './wasm-imports.js';
import { enhanceTestError, processWASMErrorStack } from './wasm-errors.js';
import { createPoolError, createPoolErrorFromAnyError } from '../util/pool-errors.js';

function createExecutorPoolError(
  testFileBasename: string,
  context: string,
  reason: string,
  cause?: any,
): AssemblyScriptPoolError {
  return createPoolError(
    `${testFileBasename} - ${context} WASM executor: ${reason}`,
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
export async function executeWASMDiscovery(
  binary: Uint8Array,
  sourceMap: string,
  testFileBasename: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  defaultTestOptions: AssemblyScriptTestOptions,
  isBinaryInstrumented: boolean,
  handleLog: AssemblyScriptConsoleLogHandler,
  file: File,
): Promise<void> {
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

  const importObject = createDiscoveryImports(memory, file, defaultTestOptions, handleLog, coverageMemory);

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(module, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level test() and describe()
  if (typeof exports._start === 'function') {
    try {
      exports._start();
    } catch (error) {
      const thrownErrAny: any = error as any;

      // error came from the abort() handler
      if (thrownErrAny?.name === POOL_ERROR_NAMES.WASMExecutionAbortError) {

        // For discovery abort, test error is set on PoolError's `cause`.
        // Enhance it if it is present.
        if (thrownErrAny?.cause?.name === TEST_ERROR_NAMES.WASMRuntimeError) {
          const reportableTestError = thrownErrAny.cause as AssemblyScriptTestError;
          
          // special handing for discovery's abort() handler
          // which includes the rawErrorStack directly on the test error
          if (reportableTestError.rawCallStack) {
            const { parsedStack } = await processWASMErrorStack(
              reportableTestError.rawCallStack as NodeJS.CallSite[],
              sourceMap,
              false
            );
            reportableTestError.stacks = parsedStack;

            // delete the raw stack so vitest doesn't complain about unexpected error values
            delete reportableTestError.rawCallStack;
          }

          throw createExecutorPoolError(
            testFileBasename,
            'discoverTests',
            `${reportableTestError.name}: ${reportableTestError.message}`,
            reportableTestError
          );
        }
      } else {
        throw createPoolErrorFromAnyError(
          `${testFileBasename} - Unexpected discovery error`,
          POOL_ERROR_NAMES.WASMExecutionHarnessError,
          error
        );
      }
    }
  } else {
    throw createExecutorPoolError(testFileBasename, 'discoverTests', 'no _start() export');
  }

  debug('[Executor] Discovered', file.tasks.length, 'tests');
  return;
}

/**
 * Execute a single test with crash isolation
 */
export async function executeWASMTest(
  test: Test,
  cached: CachedCompilation,
  testFileBasename: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  collectCoverage: boolean,
  handleLog: AssemblyScriptConsoleLogHandler,
  diffOptions?: SerializedDiffOptions,
): Promise<{ test: Test, timings: WASMExecutorPerfTimings }> {
  const timings: WASMExecutorPerfTimings = {
    fnInit: performance.now(),
    execStart: 0,
    execEnd: 0,
    fnfinal: 0
  };

  // Compile the binary to usable WASM module
  const module = await WebAssembly.compile(cached.binary as BufferSource);

  // Create fresh memory for this test instance
  const memory = createMemory();

  // Create coverage memory if collecting coverage (instrumented binary)
  const coverageMemory = collectCoverage ?
    new WebAssembly.Memory({
      initial: poolOptions.coverageMemoryPagesMin,
      maximum: poolOptions.coverageMemoryPagesMax
    })
    : undefined;

  // Create import object with pool-side functions for capturing test execution results
  const importObject = createTestExecutionImports(memory, test, handleLog, coverageMemory);

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
    throw createExecutorPoolError(testFileBasename, 'executeWASMTest', 'no _start() export');
  }

  let testFn: (() => void) | null | undefined;

  // Get the test function to execute via function table
  // (accessable because we're using the AS compiler --exportTable flag)
  const table = exports.table as WebAssembly.Table | undefined;
  
  if (table && typeof table.get === 'function') {
    const idx = (test.meta as AssemblyScriptTestTaskMeta).fnIndex;
    testFn = table.get(idx) as (() => void) | null;

    if (!testFn) {
      throw createExecutorPoolError(
        testFileBasename,
        'executeWASMTest',
        `Test function at index ${idx} not found in function table`
      );
    }
  } else {
    throw createExecutorPoolError(
      testFileBasename,
      'executeWASMTest',
      'Function table not found in WASM exports (missing --exportTable flag?)'
    );
  }

  // try-catch to ensure we capture known test errors to report
  // as AssemblyScriptTestErrors to vitest
  try {
    // Execute this test
    timings.execStart = performance.now();
    testFn();
    timings.execEnd = performance.now();

    // If we reach here, test passed, i.e. No abort occurred.
    // Proceed below to prepare the test result
  } catch (error) {
    timings.execEnd = performance.now();

    const thrownErrAny = error as any;
    // If this is NOT a WASMExecutionAbort error, it means it did NOT originate from the
    // wasm abort() import and is unexpected, so we throw as a PoolError.
    //
    // Otherwise this IS a WASMExecutionAbort error and the wasm abort() import threw it as a
    // known test error (assertion or wasm runtime), so we continue to prepare the test result 
    const isUnexpectedError = thrownErrAny?.name !== POOL_ERROR_NAMES.WASMExecutionAbortError;

    if (isUnexpectedError) {
      throw createExecutorPoolError(
        testFileBasename,
        'executeWASMTest',
        `Unexpected execution error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
        (error as any)?.cause
      );
    }
  }

  const meta = test.meta as AssemblyScriptTestTaskMeta;
  
  // If error is present, apply source mapping to make stack locations
  // useful, and add nicely-formatted diffs for reporting through vitest
  if (meta.lastError) {
    const enhancedError = await enhanceTestError(
      meta.lastError,
      test,
      cached.sourceMap,
      meta.lastErrorValuesProvided ?? false,
      meta.lastErrorRawCallStack,
      diffOptions
    );

    if (test.result) {
      if (test.result.errors) {
        test.result.errors.push(enhancedError);
      } else {
        test.result.errors = [enhancedError];
      }
    }

    delete meta.lastError;
    delete meta.lastErrorValuesProvided;
    delete meta.lastErrorRawCallStack;
  }

  // Extract coverage hits from coverage memory
  if (collectCoverage) {
    if (!coverageMemory) {
      throw createExecutorPoolError(
        testFileBasename,
        'executeWASMTest',
        'Coverage memory not created despite collectCoverage=true'
      );
    }

    if (!cached.debugInfo) {
      throw createExecutorPoolError(
        testFileBasename,
        'executeWASMTest',
        'debugInfo is required when collectCoverage=true'
      );
    }

    const coverage: CoverageData = {
      hitCountsByFileAndPosition: {},
    };

    // Read counters from coverage memory
    const extractedHitCounters = new Uint32Array(coverageMemory.buffer, 0, cached.debugInfo.instrumentedFunctionCount);
    debug(`[Executor] Read coverage memory for ${cached.debugInfo.instrumentedFunctionCount} instrumented functions`);

    // Iterate all instrumented functions and build coverage data with hit counts extracted from coverage memory
    let functionsHit = 0;
    for (const [filePath, debugFunctions] of Object.entries(cached.debugInfo.functionsByFileAndPosition)) {
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

    meta.coverageData = coverage;
    debug(`[Executor] Extracted coverage data: ${functionsHit} functions hit`);
  }

  timings.fnfinal = performance.now();

  return { test, timings };
}
