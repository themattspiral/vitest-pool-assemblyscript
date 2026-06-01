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
import { AS_POOL_ERROR_FLAG, POOL_ERROR_NAMES } from '../types/constants.js';
import { debug, debugOverride } from '../util/debug.js';
import { createMemory } from './wasm-memory.js';
import { createDiscoveryImports, createTestExecutionImports } from './wasm-imports.js';
import { enhanceTestError } from './wasm-errors.js';
import { createPoolError, wrapPoolError } from '../util/pool-errors.js';
import { failTestRuntimeError, getTaskLogLabel } from '../util/vitest-tasks.js';
import { extractCallStack } from './source-maps.js';

const SIG_MISMATCH_ERROR_MSG = `WASM function signature type mismatch during test collection.`
  + ` This is most likely caused by passing a type-inferred, non-void callback to expect().`
  + ` To fix, either explicitly define the non-void return type on the callback`
  + `  e.g. \`expect((): i32 => failingFunction()).toThrowError()\``
  + ` or use braces to make it void  e.g. \`expect(() => { failingFunction(); }).toThrowError()\`.`
  + ` Look for the failing expect() within the describe() block indicated in the stack trace.`;

function verifyMemoryRequirements(
  compilation: WASMCompilation,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
) {
  if (poolOptions.testMemoryPagesInitial && poolOptions.testMemoryPagesInitial < compilation.requiredMemory.testMemory.initialPages) {
    throw createPoolError(
        POOL_ERROR_NAMES.PoolConfigError,
        `WASM binary requires initial test memory pages (${compilation.requiredMemory.testMemory.initialPages}) exceeding configured "testMemoryPagesInitial"`
      + ` (${poolOptions.testMemoryPagesInitial}). Increase value, or remove for auto sizing.`,
      );
  }
  
  if (poolOptions.testMemoryPagesMax && compilation.requiredMemory.testMemory.maximumPages
    && poolOptions.testMemoryPagesMax < compilation.requiredMemory.testMemory.maximumPages
  ) {
    throw createPoolError(
      POOL_ERROR_NAMES.PoolConfigError,
      `WASM binary requires maximum test memory pages (${compilation.requiredMemory.testMemory.maximumPages}) exceeding configured "testMemoryPagesMax"`
      + ` (${poolOptions.testMemoryPagesMax}). Increase value, or remove for auto sizing.`,
    );
  }
  
  if (poolOptions.coverageMemoryPagesInitial && poolOptions.coverageMemoryPagesInitial < compilation.requiredMemory.coverageMemory.initialPages) {
    throw createPoolError(
      POOL_ERROR_NAMES.PoolConfigError,
      `WASM binary requires initial coverage memory pages (${compilation.requiredMemory.coverageMemory.initialPages}) exceeding configured "coverageMemoryPagesInitial"`
      + ` (${poolOptions.coverageMemoryPagesInitial}). Increase value, or remove for auto sizing.`,
    );
  }

  if (poolOptions.coverageMemoryPagesMax && compilation.requiredMemory.coverageMemory.maximumPages
    && poolOptions.coverageMemoryPagesMax < compilation.requiredMemory.coverageMemory.maximumPages
  ) {
    throw createPoolError(
      POOL_ERROR_NAMES.PoolConfigError,
      `WASM binary requires maximum coverage memory pages (${compilation.requiredMemory.coverageMemory.maximumPages}) exceeding configured "coverageMemoryPagesMax"`
      + ` (${poolOptions.coverageMemoryPagesMax}). Increase value, or remove for auto sizing.`,
    );
  }
}

function createExecutorMemories(
  compilation: WASMCompilation,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  includeCoverageMemory: boolean,
): { testMemory: WebAssembly.Memory; coverageMemory?: WebAssembly.Memory } {
  verifyMemoryRequirements(compilation, poolOptions);

  const testMemory = createMemory(
    poolOptions.testMemoryPagesInitial ?? compilation.requiredMemory.testMemory.initialPages,
    poolOptions.testMemoryPagesMax ?? compilation.requiredMemory.testMemory.maximumPages
  );
  const coverageMemory = includeCoverageMemory ?
    createMemory(
      poolOptions.coverageMemoryPagesInitial ?? compilation.requiredMemory.coverageMemory.initialPages,
      poolOptions.coverageMemoryPagesMax ?? compilation.requiredMemory.coverageMemory.maximumPages
    )
    : undefined;

  return { testMemory, coverageMemory };
}

/**
 * Discover tests via test() and suites via describe() registration calls
 */
export async function executeWASMDiscovery(
  compilation: WASMCompilation,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  isBinaryInstrumented: boolean,
  handleLog: AssemblyScriptConsoleLogHandler,
  file: File,
  moduleLabel: string,
  threadImports: ThreadImports,
): Promise<void> {
  const base = basename(file.filepath);
  const logPrefix = `[${moduleLabel} Exec] ${getTaskLogLabel(base, file)}`;
  
  try {
    const { testMemory, coverageMemory } = createExecutorMemories(compilation, poolOptions, isBinaryInstrumented);

    const importObject = createDiscoveryImports(
      testMemory,
      compilation.compiledModule,
      file,
      handleLog,
      logPrefix,
      coverageMemory,
      threadImports.createUserWasmImports
    );

    // Instantiate WASM module
    const instance = new WebAssembly.Instance(compilation.compiledModule, importObject);
    const exports = instance.exports as Record<string, unknown>;

    // Call _start to run top-level test() and describe()
    if (typeof exports._start === 'function') {
      exports._start();
    } else {
      throw createPoolError(
        POOL_ERROR_NAMES.WASMExecutionHarnessError,
        'no _start() export found on compiled WASM binary'
      );
    }
  } catch (error: any) {
    if (error && error[AS_POOL_ERROR_FLAG]) {
      throw error;
    }

    // void type inference issue
    if (error instanceof WebAssembly.RuntimeError && error.message.includes('null function or function signature mismatch')) {
      throw createPoolError(POOL_ERROR_NAMES.PoolSyntaxError, SIG_MISMATCH_ERROR_MSG, error);
    }

    if (error instanceof Error) {
      let match: RegExpExecArray | null = null;
      let moduleName: string | undefined;
      let functionName: string | undefined;
      let errorMessage: string | undefined;
      
      if (match = /"(.+)": module is not an object or function/.exec(error.message)) {
        // module import error
        moduleName = match[1];
        errorMessage = `Expected module "${moduleName}" to be defined as an object`
          + ` or function within user WASM imports (returned by WasmImportsFactory).`;
      } else if (match = /"(.+)" (function=)?"(.+)": function import requires a callable/.exec(error.message)) {
        // function import error
        moduleName = match[1];
        functionName = match[3];
        errorMessage = `Expected function "${functionName}" to be defined in module "${moduleName}"`
          + ` within user WASM imports (returned by WasmImportsFactory).`;
      }

      if (errorMessage) {
        throw createPoolError(POOL_ERROR_NAMES.WASMUserImportsError, errorMessage, error);
      }
    }
    
    // any other error
    throw wrapPoolError(POOL_ERROR_NAMES.WASMExecutionHarnessError, error, true);
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
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  collectCoverage: boolean,
  handleLog: AssemblyScriptConsoleLogHandler,
  moduleLabel: string,
  threadImports: ThreadImports,
  projectRoot: string,
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

  function covDebug(...args: any[]): void {
    if (poolOptions.debugCoverageExtract) {
      debugOverride(...args);
    }
  };

  const { testMemory, coverageMemory } = createExecutorMemories(compilation, poolOptions, collectCoverage);

  // Create import object with pool-side functions for capturing test execution results
  const { imports, provideFunctionTable } = createTestExecutionImports(
    testMemory,
    compilation.compiledModule,
    test,
    handleLog,
    logPrefix,
    coverageMemory,
    threadImports.createUserWasmImports
  );

  // Instantiate fresh WASM instance for this test
  const instance = new WebAssembly.Instance(compilation.compiledModule, imports);
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
    throw createPoolError(
      POOL_ERROR_NAMES.WASMExecutionHarnessError,
      'no _start() export found on compiled WASM binary'
    );
  }

  let testFn: (() => void) | null | undefined;
  
  if (table && typeof table.get === 'function') {
    const idx = (test.meta as AssemblyScriptTestTaskMeta).fnIndex;
    testFn = table.get(idx) as (() => void) | null;

    if (!testFn) {
      throw createPoolError(
        POOL_ERROR_NAMES.WASMExecutionHarnessError,
        `Test function at index ${idx} not found in function table`
      );
    }
  } else {
    throw createPoolError(
      POOL_ERROR_NAMES.WASMExecutionHarnessError,
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
  } catch (error: any) {
    testTimings.execEnd = performance.now();

    let testError: AssemblyScriptTestError;
    let stack: NodeJS.CallSite[];
    let allowStackJS: boolean;
    let applyStackToTestErrorCause: boolean;

    if (error && error[AS_POOL_ERROR_FLAG]) {
      const wrapper = error as AssemblyScriptPoolError;
      testError = wrapper.testError;
      stack = wrapper.originalErrorRawStack;
      allowStackJS = wrapper.originalErrorMayContainJS;
      applyStackToTestErrorCause = wrapper.applyStackToTestErrorCause;
    } else if (error instanceof Error) {
      testError = failTestRuntimeError(test, error.name, error.message);
      stack = extractCallStack(error);
      allowStackJS = true;
      applyStackToTestErrorCause = false;
    } else {
      testError = failTestRuntimeError(test, '', `Unexpected WASM test execution error: ${String(error)}`);
      stack = extractCallStack(new Error());
      allowStackJS = true;
      applyStackToTestErrorCause = false;
    }

    await enhanceTestError(
      testError,
      test,
      compilation.sourceMap,
      logPrefix,
      allowStackJS,
      projectRoot,
      applyStackToTestErrorCause,
      stack,
      diffOptions
    );
  }

  const meta = test.meta as AssemblyScriptTestTaskMeta;

  // Extract coverage hits from coverage memory
  if (collectCoverage && compilation.debugInfo) {
    if (!coverageMemory) {
      throw createPoolError(
        POOL_ERROR_NAMES.WASMExecutionHarnessError,
        'Coverage memory not created despite collectCoverage=true'
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

      for (const [positionKey, funcInfos] of Object.entries(debugFunctions)) {
        // Sum hit counts across all functions at this position (multiple for generic monomorphizations)
        let positionHitCount = 0;
        for (const funcInfo of funcInfos) {
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
          positionHitCount += hitCount;
        }

        coverage.hitCountsByFileAndPosition[filePath][positionKey] = positionHitCount;

        if (positionHitCount > 0) {
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
