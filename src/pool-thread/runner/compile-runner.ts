/**
 * Worker thread test runner logic for AssemblyScript Pool
 */

import { basename, relative } from 'node:path';
import type { File } from '@vitest/runner/types';
import type { SerializedDiffOptions } from '@vitest/utils/diff';

import type {
  AssemblyScriptCompilerOptions,
  AssemblyScriptConsoleLog,
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  InstrumentationOptions,
  ResolvedAssemblyScriptPoolOptions,
  ThreadImports,
  WASMCompilation,
  WorkerRPC,
} from '../../types/types.js';
import {
  AS_POOL_ERROR_WRAPPER_FLAG,
  ASSEMBLYSCRIPT_LIB_PREFIX,
  INTERNAL_FUNCTION_NAME_SUBSTRING,
  INTERNAL_PATH_LIB_PREFIX,
  POOL_ERROR_NAMES,
  POOL_INTERNAL_PATHS,
} from '../../types/constants.js';
import { executeWASMDiscovery } from '../../wasm-executor/index.js';
import { debug } from '../../util/debug.js';
import { toForwardSlash } from '../../util/path-utils.js';
import {
  reportFileQueued,
  reportFileCollected,
  reportUserConsoleLogs,
  flushRpcUpdates,
  reportFileError,
} from '../rpc-reporter.js';
import { compileAssemblyScript } from '../../compiler/index.js';
import {
  getTaskLogLabel,
  getTaskLogPrefix,
} from '../../util/vitest-tasks.js';
import {
  failFile,
  getFullTaskHierarchy,
  prepareFileTaskForCollection,
} from '../../util/vitest-file-tasks.js';
import { getWasmMemoryRequirements } from '../../wasm-executor/wasm-memory.js';
import { extractCallStack } from '../../wasm-executor/source-maps.js';
import { enhanceTestError } from '../../wasm-executor/wasm-errors.js';

let threadCompilationCount: number = 0;

export async function runCompileAndDiscover(
  file: File,
  logModule: string,
  rpc: WorkerRPC,
  asPoolOptions: ResolvedAssemblyScriptPoolOptions,
  projectRoot: string,
  collectCoverage: boolean,
  relativeUserCoverageExclusions: string[],
  threadImports: ThreadImports,
  diffOptions?: SerializedDiffOptions,
  testNamePattern?: RegExp,
  allowOnly?: boolean,
): Promise<WASMCompilation | undefined> {
  const base = basename(file.filepath);
  const fileLogPrefix = getTaskLogPrefix(logModule, base, file);
  const fileLogLabel = getTaskLogLabel(base, file);

  debug(`${fileLogPrefix} - Beginning runCompileAndDiscover for "${file.filepath}" at ${Date.now()}`);

  const runStartPerf = performance.now();
  let compilation: WASMCompilation | undefined;

  try {
    await reportFileQueued(rpc, file, logModule, fileLogLabel);

    const relativeTestFilePath = toForwardSlash(relative(projectRoot, file.filepath));
    const instrumentationOptions: InstrumentationOptions = {
      projectRoot,
      relativeExcludedFiles: [
        relativeTestFilePath,
        ...(asPoolOptions._instrumentPoolInternals ? [] : POOL_INTERNAL_PATHS),
        ...relativeUserCoverageExclusions,
      ],
      excludedLibraryFilePrefix: ASSEMBLYSCRIPT_LIB_PREFIX,
      excludedLibraryFileOverridePrefix: asPoolOptions._instrumentPoolInternals ? INTERNAL_PATH_LIB_PREFIX : undefined,
      excludedInternalFunctionSubstring: INTERNAL_FUNCTION_NAME_SUBSTRING,
      coverageMemoryPagesMin: asPoolOptions.coverageMemoryPagesInitial ?? 1,
      coverageMemoryPagesMax: asPoolOptions.coverageMemoryPagesMax ?? 4,
      debug: asPoolOptions.debugNative,
    };
    const compilerOptions: AssemblyScriptCompilerOptions = {
      stripInline: asPoolOptions.stripInline,
      projectRoot,
      shouldInstrument: collectCoverage,
      instrumentationOptions,
      extraFlags: asPoolOptions.extraCompilerFlags
    };

    const { binary, sourceMap, debugInfo, compileTiming } = await compileAssemblyScript(
      file.filepath,
      compilerOptions,
      logModule,
      fileLogLabel
    );
    file.setupDuration = compileTiming;
    threadCompilationCount++;

    debug(`${fileLogPrefix} - TIMING compileAssemblyScript total `
      + `(thread comp # ${threadCompilationCount}): ${compileTiming.toFixed(2)} ms`
    );

    const requiredMemory = getWasmMemoryRequirements(binary);
    debug(`${fileLogPrefix} - Compilation Required Memory:`, requiredMemory);

    compilation = {
      filePath: file.filepath,
      binary,
      sourceMap,
      debugInfo,
      requiredMemory
    };
    
    const logMessages: AssemblyScriptConsoleLog[] = [];
    const handleLog: AssemblyScriptConsoleLogHandler = (msg: string, isError: boolean = false): void => {
      logMessages.push({ msg, time: Date.now(), isError });
    };
    
    const discoverStartPerf = performance.now();

    await executeWASMDiscovery(
      compilation,
      asPoolOptions,
      collectCoverage,
      handleLog,
      file,
      logModule,
      threadImports,
    );

    // set skips when using only and/or user test name pattern, skip file task if all tests skipped
    prepareFileTaskForCollection(file, testNamePattern, allowOnly);

    file.collectDuration = performance.now() - discoverStartPerf;
    debug(`${fileLogPrefix} - TIMING Discovery Phase: ${file.collectDuration.toFixed(2)} ms`);

    // vitest collect - report discovery results
    await Promise.all([
      // Report user console logs
      reportUserConsoleLogs(rpc, logMessages, logModule, base, file),

      // Report onCollected with collected and filtered tasks
      reportFileCollected(rpc, file, logModule, fileLogLabel),
    ]);

    debug(() => `${fileLogPrefix} - Collected Test Suite Hierarchy:\n${getFullTaskHierarchy(file)}`);

    const totalTime = performance.now() - runStartPerf;
    debug(`${fileLogPrefix} - TIMING Compilation and Discovery: ${totalTime.toFixed(2)} ms`);
  } catch (error: any) {
    let testError: AssemblyScriptTestError;
    let stack: NodeJS.CallSite[];
    let allowStackJS: boolean;
    let applyStackToTestErrorCause: boolean;

    if (error && error[AS_POOL_ERROR_WRAPPER_FLAG]) {
      const wrapper = error as AssemblyScriptPoolError;
      testError = wrapper.testError;
      stack = wrapper.originalErrorRawStack;
      allowStackJS = wrapper.originalErrorMayContainJS;
      applyStackToTestErrorCause = wrapper.applyStackToTestErrorCause;
    } else if (error instanceof Error) {
      testError = {
        name: POOL_ERROR_NAMES.WASMExecutionHarnessError,
        message: `${error.name}: ${error.message}`
      };
      stack = extractCallStack(error);
      allowStackJS = true;
      applyStackToTestErrorCause = false;
    } else {
      testError = {
        name: POOL_ERROR_NAMES.WASMExecutionHarnessError,
        message: `Unexpected WASM compile runner error: ${String(error)}`
      };
      stack = extractCallStack(new Error());
      allowStackJS = true;
      applyStackToTestErrorCause = false;
    }

    await enhanceTestError(
      testError,
      file,
      compilation?.sourceMap,
      fileLogPrefix,
      allowStackJS,
      projectRoot,
      applyStackToTestErrorCause,
      stack,
      diffOptions
    );

    failFile(file, testError, runStartPerf);

    await reportFileError(rpc, file, logModule, fileLogLabel);

    debug(`${fileLogPrefix} - runCompileAndDiscover - Reported file error:`, testError);
  } finally {
    await flushRpcUpdates(rpc);
    debug(`${fileLogPrefix} - runCompileAndDiscover Completed`);
  }

  return compilation;
}
