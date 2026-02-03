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
  InstrumentationOptions,
  ResolvedAssemblyScriptPoolOptions,
  ThreadImports,
  WASMCompilation,
  WorkerRPC,
} from '../../types/types.js';
import {
  ASSEMBLYSCRIPT_LIB_PREFIX,
  INTERNAL_PATH_LIB_PREFIX,
  POOL_ERROR_NAMES,
  POOL_INTERNAL_PATHS,
} from '../../types/constants.js';
import { executeWASMDiscovery } from '../../wasm-executor/index.js';
import { debug } from '../../util/debug.js';
import {
  reportFileQueued,
  reportFileCollected,
  reportUserConsoleLogs,
  flushRpcUpdates,
  reportFileError,
} from '../rpc-reporter.js';
import { createPoolErrorFromAnyError, getTestErrorFromPoolError } from '../../util/pool-errors.js';
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

let threadCompilationCount: number = 0;

export async function runCompileAndDiscover(
  file: File,
  logModule: string,
  rpc: WorkerRPC,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
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

  const runStart = performance.now();
  let compilation: WASMCompilation | undefined;

  try {
    await reportFileQueued(rpc, file, logModule, fileLogLabel);

    // TODO - move to options helpers
    const relativeTestFilePath = relative(projectRoot, file.filepath);
    const instrumentationOptions: InstrumentationOptions = {
      relativeExcludedFiles: [
        relativeTestFilePath,
        ...(poolOptions._instrumentPoolInternals ? [] : POOL_INTERNAL_PATHS),
        ...relativeUserCoverageExclusions,
      ],
      excludedLibraryFilePrefix: ASSEMBLYSCRIPT_LIB_PREFIX,
      excludedLibraryFileOverridePrefix: poolOptions._instrumentPoolInternals ? INTERNAL_PATH_LIB_PREFIX : undefined,
      coverageMemoryPagesMin: poolOptions.coverageMemoryPagesInitial,
      coverageMemoryPagesMax: poolOptions.coverageMemoryPagesMax,
      debug: poolOptions.debugNative,
    };
    const compilerOptions: AssemblyScriptCompilerOptions = {
      stripInline: poolOptions.stripInline,
      projectRoot: projectRoot,
      shouldInstrument: collectCoverage,
      instrumentationOptions,
      extraFlags: poolOptions.extraCompilerFlags
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
    
    const logMessages: AssemblyScriptConsoleLog[] = [];
    const handleLog: AssemblyScriptConsoleLogHandler = (msg: string, isError: boolean = false): void => {
      logMessages.push({ msg, time: Date.now(), isError });
    };
    
    const discoverStart = performance.now();

    await executeWASMDiscovery(
      binary,
      sourceMap,
      base,
      poolOptions,
      collectCoverage,
      handleLog,
      file,
      logModule,
      threadImports,
      diffOptions
    );

    // set skips when using only and/or user test name pattern, skip file task if all tests skipped
    prepareFileTaskForCollection(file, testNamePattern, allowOnly);

    file.collectDuration = performance.now() - discoverStart;
    debug(`${fileLogPrefix} - TIMING Discovery Phase: ${file.collectDuration.toFixed(2)} ms`);

    // vitest collect - report discovery results
    await Promise.all([
      // Report user console logs
      reportUserConsoleLogs(rpc, logMessages, logModule, base, file),

      // Report onCollected with collected and filtered tasks
      reportFileCollected(rpc, file, logModule, fileLogLabel),
    ]);

    debug(() => `${fileLogPrefix} - Collected Test Suite Hierarchy:\n${getFullTaskHierarchy(file)}`);

    const totalTime = performance.now() - runStart;
    debug(`${fileLogPrefix} - TIMING Compilation and Discovery: ${totalTime.toFixed(2)} ms`);

    compilation = {
      filePath: file.filepath,
      binary,
      sourceMap,
      debugInfo,
    };
  } catch (error) {
    const poolError = createPoolErrorFromAnyError(
      `${fileLogLabel} - runCompileAndDiscover failure in worker`,
      POOL_ERROR_NAMES.WASMExecutionHarnessError,
      error
    );
    const testError = getTestErrorFromPoolError(poolError);

    failFile(file, testError, runStart);

    await reportFileQueued(rpc, file, logModule, fileLogLabel);
    await reportFileError(rpc, file, logModule, fileLogLabel);

    debug(`${fileLogPrefix} - Reported file error`);
  } finally {
    await flushRpcUpdates(rpc);
    debug(`${fileLogPrefix} - runCompileAndDiscover Completed`);
  }

  return compilation;
}
