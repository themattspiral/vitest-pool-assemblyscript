/**
 * Worker thread test runner logic for AssemblyScript Pool
 */

import { basename, relative } from 'node:path';
import type { RunnerTestFile } from 'vitest';
import type { SerializedDiffOptions } from '@vitest/utils/diff';

import type {
  AssemblyScriptCompilerOptions,
  AssemblyScriptConsoleLog,
  AssemblyScriptConsoleLogHandler,
  InstrumentationOptions,
  ResolvedAssemblyScriptPoolOptions,
  ThreadImports,
  WASMCompilation,
  WorkerRPC,
} from '../../types/types.js';
import {
  AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
  AS_POOL_WASM_IMPORTS_MODULE_NAME,
  ASSEMBLYSCRIPT_LIB_PREFIX,
  INTERNAL_FUNCTION_NAME_SUBSTRING,
  INTERNAL_PATH_LIB_PREFIX,
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
import { getTaskLogLabel, getTaskLogPrefix } from '../../util/vitest-tasks.js';
import {
  failFile,
  getFullTaskHierarchy,
  prepareFileTaskForCollection,
} from '../../util/vitest-file-tasks.js';
import { buildEnhancedFileError } from '../../util/pool-errors.js';

let threadCompilationCount: number = 0;

export async function runCompileAndDiscover(
  file: RunnerTestFile,
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

  let compilation: WASMCompilation | undefined;
  let reportedQueued: boolean = false;
  
  const runStartPerf = performance.now();

  try {
    await reportFileQueued(rpc, file, logModule, fileLogLabel);
    reportedQueued = true;

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
      debug: asPoolOptions.debugNative,
      coverageMemoryModule: AS_POOL_WASM_IMPORTS_MODULE_NAME,
      coverageMemoryName: AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME
    };
    const compilerOptions: AssemblyScriptCompilerOptions = {
      stripInline: asPoolOptions.stripInline,
      projectRoot,
      shouldInstrument: collectCoverage,
      instrumentationOptions,
      extraFlags: asPoolOptions.extraCompilerFlags
    };

    compilation = await compileAssemblyScript(
      file.filepath,
      compilerOptions,
      logModule,
      fileLogLabel
    );
    file.setupDuration = compilation.compileTiming;
    threadCompilationCount++;

    debug(`${fileLogPrefix} - TIMING compileAssemblyScript total `
      + `(thread comp # ${threadCompilationCount}): ${compilation.compileTiming.toFixed(2)} ms`
    );
    
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
  } catch (error) {
    const testError = await buildEnhancedFileError(
      error,
      file,
      compilation?.sourceMap,
      fileLogPrefix,
      projectRoot,
      'compile runner',
      diffOptions
    );

    failFile(file, testError, runStartPerf);

    if (!reportedQueued) {
      await reportFileQueued(rpc, file, logModule, fileLogLabel);
    }
    await reportFileError(rpc, file, logModule, fileLogLabel);

    debug(`${fileLogPrefix} - runCompileAndDiscover - Reported file error:`, testError);
  } finally {
    await flushRpcUpdates(rpc);
    debug(`${fileLogPrefix} - runCompileAndDiscover Completed`);
  }

  return compilation;
}
