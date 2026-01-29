import { basename } from 'node:path';
import type { SerializedDiffOptions } from '@vitest/utils/diff';
import type { File, Test } from '@vitest/runner/types';

import type {
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  AssemblyScriptTestTaskMeta,
  CoverageData,
  ResolvedAssemblyScriptPoolOptions,
  ThreadImports,
  WASMCompilation,
  WASMExecutorPerfTimings,
} from '../types/types.js';
import { POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import { createMemory } from './wasm-memory.js';
import { createDiscoveryImports, createTestExecutionImports } from './wasm-imports.js';
import { enhanceTestError } from './wasm-errors.js';
import { createPoolError, createPoolErrorFromAnyError } from '../util/pool-errors.js';
import { getTaskLogLabel } from '../util/vitest-tasks.js';
import { extractCallStack } from './source-maps.js';

const DEBUG_COVERAGE_EXTRACT = false;
const SIG_MISMATCH_ERROR_MSG = `WASM RuntimeError indicates function signature type mismatch during test suite collection.`
  + ` This is likely caused by passing a non-void callback to expect().`
  + ` Use braces to ensure it returns void  e.g. \`expect(() => { failingFunction(); }).toThrowError()\`.`
  + ` Look for the failing expect() within the describe() block indicated in the stack trace.`

function covDebug(...args: any[]): void {
  if (DEBUG_COVERAGE_EXTRACT) {
    debug(...args);
  }
};

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
 * Discover tests via test() and suites via describe() registration calls
 */
export async function executeWASMDiscovery(
  binary: Uint8Array,
  sourceMap: string,
  testFileBasename: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  isBinaryInstrumented: boolean,
  handleLog: AssemblyScriptConsoleLogHandler,
  file: File,
  moduleLabel: string,
  threadImports: ThreadImports,
  diffOptions?: SerializedDiffOptions,
): Promise<void> {
  const base = basename(file.filepath);
  const logPrefix = `[${moduleLabel} Exec] ${getTaskLogLabel(base, file)}`;
  const wasmModule = await WebAssembly.compile(binary as BufferSource);
  const memory = createMemory(poolOptions.testMemoryPagesInitial, poolOptions.testMemoryPagesMax);

  // Create coverage memory matching instrumentation expections (from user config).
  // While this memory will not be used, discovery instantiates the same binary,
  // and WebAssembly.Instance will throw if the expected memory sizes don't match
  const coverageMemory = isBinaryInstrumented ?
    createMemory(poolOptions.coverageMemoryPagesInitial, poolOptions.coverageMemoryPagesMax)
    : undefined;

  const importObject = createDiscoveryImports(
    memory,
    wasmModule,
    file,
    handleLog,
    logPrefix,
    coverageMemory,
    threadImports.createWasmImports
  );

  // Instantiate WASM module
  const instance = new WebAssembly.Instance(wasmModule, importObject);
  const exports = instance.exports as Record<string, unknown>;

  // Call _start to run top-level test() and describe()
  if (typeof exports._start === 'function') {
    try {
      exports._start();
    } catch (error) {
      const thrownErrAny: any = error as any;

      const isFunctionSignatureMismatch: boolean = error instanceof WebAssembly.RuntimeError
        && thrownErrAny?.message.includes('null function or function signature mismatch');
      if (isFunctionSignatureMismatch) {
        const runtimeError = error as WebAssembly.RuntimeError;
        const stack = extractCallStack(runtimeError);
        const testError = await enhanceTestError(
          {
            name: TEST_ERROR_NAMES.WASMRuntimeError,
            message: runtimeError.message
          } satisfies AssemblyScriptTestError,
          file,
          sourceMap,
          false,
          logPrefix,
          threadImports.highlight,
          stack,
          diffOptions
        );

        throw createPoolError(
          `${SIG_MISMATCH_ERROR_MSG}\n Caused by: ${runtimeError.name}: ${runtimeError.message}`,
          POOL_ERROR_NAMES.PoolSyntaxError,
          undefined,
          testError
        );
      }

      // Check to see if error came from the discovery abort() handler
      // For discovery abort, test error is set on PoolError's `cause`,
      // and the raw call stack is on PoolError's `rawCallStack`
      if (
        thrownErrAny?.name === POOL_ERROR_NAMES.WASMExecutionAbortError
        && thrownErrAny?.cause?.name === TEST_ERROR_NAMES.WASMRuntimeError
        && (error as AssemblyScriptPoolError).rawCallStack
      ) {
        const thrownPoolErr = thrownErrAny as AssemblyScriptPoolError;
        thrownPoolErr.cause = await enhanceTestError(
          thrownPoolErr.cause as AssemblyScriptTestError,
          file,
          sourceMap,
          false,
          logPrefix,
          threadImports.highlight,
          thrownPoolErr.rawCallStack,
          diffOptions
        );
        thrownPoolErr.causeIsEnhancedError = true;

        // delete the raw stack so vitest doesn't complain about unexpected error values
        delete thrownPoolErr.rawCallStack;

        // rethrow it with the enhanced test error
        throw thrownPoolErr;
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

  debug(`${logPrefix} - Discovered ${file.tasks.length} top-level tasks`);
  return;
}

/**
 * Execute a single test with crash isolation
 */
export async function executeWASMTest(
  test: Test,
  compilation: WASMCompilation,
  testFileBasename: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  collectCoverage: boolean,
  handleLog: AssemblyScriptConsoleLogHandler,
  moduleLabel: string,
  threadImports: ThreadImports,
  diffOptions?: SerializedDiffOptions,
): Promise<{ test: Test, testTimings: WASMExecutorPerfTimings }> {
  const testTimings: WASMExecutorPerfTimings = {
    fnInit: performance.now(),
    execStart: 0,
    execEnd: 0,
    fnfinal: 0
  };
  const base = basename(test.file.filepath);
  const fullModuleLabel = `${moduleLabel} Exec`;
  const taskLabel = getTaskLogLabel(base, test);
  const logPrefix = `[${fullModuleLabel}] ${taskLabel}`;

  // Compile the binary to usable WASM module
  const wasmModule = await WebAssembly.compile(compilation.binary as BufferSource);

  // Create fresh memory for this test instance
  const memory = createMemory(poolOptions.testMemoryPagesInitial, poolOptions.testMemoryPagesMax);

  // Create coverage memory if collecting coverage (instrumented binary)
  const coverageMemory = collectCoverage ?
    createMemory(poolOptions.coverageMemoryPagesInitial, poolOptions.coverageMemoryPagesMax)
    : undefined;

  // Create import object with pool-side functions for capturing test execution results
  const { imports, provideFunctionTable } = createTestExecutionImports(
    memory,
    wasmModule,
    test,
    handleLog,
    logPrefix,
    coverageMemory,
    threadImports.createWasmImports
  );

  // Instantiate fresh WASM instance for this test
  const instance = new WebAssembly.Instance(wasmModule, imports);
  const exports = instance.exports as Record<string, unknown>;

  // Func table accessable because we're using the AS compiler --exportTable flag
  const table = exports.table as WebAssembly.Table | undefined;
  
  // allow imports to access table
  if (table && typeof table.get === 'function') {
    provideFunctionTable(table);
  }

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
    testTimings.execStart = performance.now();
    testFn();
    testTimings.execEnd = performance.now();

    // If we reach here, test passed, i.e. No abort occurred.
    // Proceed below to prepare the test result
  } catch (error) {
    testTimings.execEnd = performance.now();

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
      compilation.sourceMap,
      meta.lastErrorValuesProvided ?? false,
      logPrefix,
      threadImports.highlight,
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

    if (!compilation.debugInfo) {
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
    const extractedHitCounters = new Uint32Array(coverageMemory.buffer, 0, compilation.debugInfo.instrumentedFunctionCount);
    covDebug(`${logPrefix} - Read coverage memory for ${compilation.debugInfo.instrumentedFunctionCount} instrumented functions`);

    // Iterate all instrumented functions and build coverage data with hit counts extracted from coverage memory
    let functionsHit = 0;
    for (const [filePath, debugFunctions] of Object.entries(compilation.debugInfo.functionsByFileAndPosition)) {
      if (!coverage.hitCountsByFileAndPosition[filePath]) {
        coverage.hitCountsByFileAndPosition[filePath] = {};
        covDebug(`${logPrefix} - Extracting hits for source file "${filePath}"`);
      }

      for (const [positionKey, funcInfo] of Object.entries(debugFunctions)) {
        if (funcInfo.coverageMemoryIndex === undefined) {
          debug(`${logPrefix} - WARNING: NO COVERAGE MEMORY INDEX`
            + ` - func "${funcInfo.name}" (${positionKey}) Skipping hit extraction`
          );
          continue;
        }

        const hitCount = extractedHitCounters[funcInfo.coverageMemoryIndex] ?? 0;
        covDebug(`${logPrefix} - func "${funcInfo.name}" (${positionKey}) `
          + `[idx: ${funcInfo.coverageMemoryIndex}]: ${hitCount} hits`
        );

        if (coverage.hitCountsByFileAndPosition[filePath][positionKey] !== undefined) {
          debug(`${logPrefix} - WARNING: DUPLICATE POSITION`
            + ` - func "${funcInfo.name}" (${positionKey}) already extracted to coverage for ${filePath}`
          );
        }
        // Position key is already the position (line:column) from functionsByFileAndPosition
        coverage.hitCountsByFileAndPosition[filePath][positionKey] = hitCount;

        if (hitCount > 0) {
          functionsHit++;
        }
      }
    }

    meta.coverageData = coverage;
    debug(`${logPrefix} - Extracted coverage data | ${functionsHit} functions hit`);
  }

  testTimings.fnfinal = performance.now();

  return { test, testTimings };
}
