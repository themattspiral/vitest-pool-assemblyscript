/**
 * Worker thread test runner logic for AssemblyScript Pool
 */

import { basename, relative } from 'node:path';
import type { MessagePort } from 'node:worker_threads';
import type { File, Suite, Task, Test } from '@vitest/runner/types';
import type { SerializedDiffOptions } from '@vitest/utils/diff';

import type {
  AssemblyScriptCompilerOptions,
  AssemblyScriptConsoleLog,
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestTaskMeta,
  BinaryDebugInfo,
  InstrumentationOptions,
  ResolvedAssemblyScriptPoolOptions,
  TestExecutionEnd,
  TestExecutionStart,
  TestFileCompiled,
  WASMCompilation,
  WorkerRPC,
} from '../types/types.js';
import {
  AS_POOL_WORKER_MSG_FLAG,
  ASSEMBLYSCRIPT_LIB_PREFIX,
  POOL_ERROR_NAMES,
  POOL_INTERNAL_PATHS,
} from '../types/constants.js';
import {
  executeWASMDiscovery,
  executeWASMTest,
} from '../wasm-executor/index.js';
import { setDebugMode, debug } from '../util/debug.js';
import {
  reportFileQueued,
  reportFileCollected,
  reportTestPrepare,
  reportTestFinished,
  reportTestRetried,
  reportUserConsoleLogs,
  flushRpcUpdates,
  reportSuitePrepare,
  reportSuiteFinished,
  reportFileError,
} from './rpc-reporter.js';
import { createPoolErrorFromAnyError, getTestErrorFromPoolError } from '../util/pool-errors.js';
import { compileAssemblyScript } from '../compiler/index.js';
import {
  checkFailsAndInvertResult,
  failFile,
  finalizeSuiteResult,
  finalizeTestResult,
  getFullTaskHierarchy,
  getRunnableTasks,
  getTaskLogLabel,
  getTaskLogPrefix,
  prepareFileTaskForCollection,
  resetTaskMeta,
  resetTestResult,
  setSuitePrepareResult,
  setTestPrepareResult,
  shouldRetryTask,
  updateSuiteFinishedResult,
  updateTestFinishedResult
} from '../util/vitest-tasks.js';
import { mergeCoverageData } from '../coverage-provider/coverage-merge.js';

let threadCompilationCount: number = 0;

async function bailIfNeeded(
  rpc: WorkerRPC,
  bailConfig: number | undefined,
  testWithResult: Test,
  logPrefix: string,
  logModule: string,
): Promise<void> {
  if (bailConfig && testWithResult.result?.state !== 'pass') {
    const previousFailures = await rpc.getCountOfFailedTests();
    const currentFailures = 1 + previousFailures;

    if (currentFailures >= bailConfig) {
      debug(`${logPrefix} bailing: ${currentFailures} failures >= ${bailConfig} to bail`);
      debug(`[${logModule}] -------- BAIL! ${currentFailures} failures >= ${bailConfig} to bail --------`);
      return rpc.onCancel('test-failure');
    }
  }
}

async function postProcessTestResult(
  rpc: WorkerRPC,
  bailConfig: number | undefined,
  testWithResult: Test,
  logPrefix: string,
  logModule: string,
): Promise<void> {
  // invert result if test configured as 'fails'
  checkFailsAndInvertResult(testWithResult, logPrefix);

  // bail now if this is a failed test above bail threshold
  return bailIfNeeded(rpc, bailConfig, testWithResult, logPrefix, logModule);
}

export async function runTest(
  rpc: WorkerRPC,
  port: MessagePort,
  base: string,
  collectCoverage: boolean,
  binary: Uint8Array,
  sourceMap: string,
  debugInfo: BinaryDebugInfo | undefined,
  test: Test,
  logModule: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  bail?: number,
  diffOptions?: SerializedDiffOptions,
): Promise<Test> {
  const testLogPrefix = getTaskLogPrefix(logModule, base, test);
  const logMessages: AssemblyScriptConsoleLog[] = [];
  const handleLog: AssemblyScriptConsoleLogHandler = (msg: string, isError: boolean = false): void => {
    logMessages.push({ msg, time: Date.now(), isError });
  };

  const executionStart = Date.now();
  
  let testPreparePromise: Promise<void> = Promise.resolve();
  if (!test.retry || !test.result) {
    // first/only attempt: create test result and report test-prepare
    setTestPrepareResult(test, executionStart);
    testPreparePromise = reportTestPrepare(rpc, test, logModule, base);
    // await reportTestPrepare(rpc, test, logModule, base);
  } else if (test.result) {
    // this is a retry, reset the result state and meta
    resetTestResult(test, executionStart);
    resetTaskMeta(test);
  }
  
  // inform pool of test task start so it can enforce timeouts
  const startMsg: TestExecutionStart = {
    executionStart: Date.now(),
    test,
    type:
    'execution-start',
    [AS_POOL_WORKER_MSG_FLAG]: true
  };
  port.postMessage(startMsg);

  const [_reported, { testTimings }] = await Promise.all([
    testPreparePromise,
    executeWASMTest(
      test,
      binary,
      sourceMap,
      debugInfo,
      base,
      poolOptions,
      collectCoverage,
      handleLog,
      logModule,
      diffOptions
    )
  ]);

  // inform pool of test task end to stop timeout if under threshold
  const endMsg: TestExecutionEnd = {
    executionEnd: Date.now(),
    testTaskId: test.id,
    type: 'execution-end',
    [AS_POOL_WORKER_MSG_FLAG]: true
  };
  port.postMessage(endMsg);

  let willRetry = shouldRetryTask(test);

  await Promise.all([
    reportUserConsoleLogs(rpc, logMessages, logModule, base, test),

    willRetry ? reportTestRetried(rpc, test, logModule, base) : Promise.resolve(),
  ]);

  // non-timeout retry handling
  while (willRetry) {
    // increment the retry count
    test.result!.retryCount = (test.result?.retryCount ?? 0) + 1;

    debug(`${testLogPrefix} - Retrying after failure`
      + ` | Retry ${test.result?.retryCount || 0} / ${test.retry} ` 
      + ` | ${test.result?.errors?.length ?? 0} errors`
    );

    await runTest(
      rpc, port, base, collectCoverage, binary, sourceMap, debugInfo,
      test, logModule, poolOptions, bail, diffOptions
    );

    willRetry = shouldRetryTask(test);
  }

  // set passed if appropriate, set duration using executor timings
  updateTestFinishedResult(test, testTimings);

  await Promise.all([
    // as needed: invert if `fails`, bail --- move after willRetry, before finished
    postProcessTestResult(rpc, bail, test, testLogPrefix, logModule),

    reportTestFinished(rpc, test, logModule, base),
  ]);

  // ensure completed test will not be run again if another test
  // times out later and the file worker thread gets re-launched
  finalizeTestResult(test);

  return test;
}

export async function runSuite(
  rpc: WorkerRPC,
  port: MessagePort,
  base: string,
  collectCoverage: boolean,
  binary: Uint8Array,
  sourceMap: string,
  debugInfo: BinaryDebugInfo | undefined,
  suite: Suite | File,
  logModule: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  bail?: number,
  diffOptions?: SerializedDiffOptions,
  timedOutTest?: Test,
): Promise<Suite> {
  const suiteStart = performance.now();
  const suiteMeta = suite.meta as AssemblyScriptSuiteTaskMeta;
  const suiteLogPrefix = getTaskLogPrefix(logModule, base, suite);
  const isTimedOutTestInSuite: boolean = timedOutTest?.suite?.id === suite.id;

  if (suiteMeta.resultFinal) {
    debug(`${suiteLogPrefix} - Skipping completed suite | state: "${suite.result?.state}"`);

    return suite;
  } else {
    debug(`${suiteLogPrefix} - runSuite ${!!timedOutTest
      ? `resuming after test timeout ("${timedOutTest.name}") | isTestInSuite: ${isTimedOutTestInSuite}`
      : 'beginning'
    }`);
  }

  if (!suiteMeta.suitePreparedSent) {
    setSuitePrepareResult(suite);
    await reportSuitePrepare(rpc, suite, logModule, base);

    // ensure suite-prepare will only be sent once if a test
    // times out and the file worker thread gets re-launched
    suiteMeta.suitePreparedSent = true;
  }

  // restore suite coverage collected so far from the timed out test, if provided.
  // otherwise create a suite-level coverage data object to aggregate all subtask coverage
  if (isTimedOutTestInSuite) {
    suiteMeta.coverageData = (timedOutTest!.suite!.meta as AssemblyScriptSuiteTaskMeta).coverageData;
    
    const coverageKeys: number = Object.keys(suiteMeta.coverageData ?? {}).length;
    debug(`${suiteLogPrefix} - Restored suite coverage data after timeout (${coverageKeys} unique positions)`);
  } {
    // initialize aggregated coverage data for suite, which gets updated as each subtask completes
    suiteMeta.coverageData = { hitCountsByFileAndPosition: {} };
  }

  let tasksToRun: Task[] = getRunnableTasks(suite);

  for (const task of tasksToRun) {
    if (task.type === 'suite') {
      const suiteTaskMeta = task.meta as AssemblyScriptSuiteTaskMeta;

      await runSuite(
        rpc, port, base, collectCoverage, binary, sourceMap, debugInfo,
        task, logModule, poolOptions, bail, diffOptions, timedOutTest
      );

      // merge suite task coverage into parent suite coverage
      if (suiteMeta.coverageData && suiteTaskMeta.coverageData) {
        mergeCoverageData(suiteMeta.coverageData, suiteTaskMeta.coverageData);
      }
      
    } else {
      const testLogPrefix = getTaskLogPrefix(logModule, base, task);
      const testTaskMeta = task.meta as AssemblyScriptTestTaskMeta;

      const testCompleted = testTaskMeta.resultFinal;
      const testTimedOutPreviously = !!timedOutTest && task.id === timedOutTest.id;

      if (testCompleted) {
        debug(`${testLogPrefix} - Skipping completed test | state: "${task.result?.state}"`);
      } else if (testTimedOutPreviously) {
        if (shouldRetryTask(task)) {
          const previousRetryCount = task.result?.retryCount ?? 0;
          const newRetryCount = previousRetryCount + 1;

          debug(`${testLogPrefix} - Retrying after test timeout`
            + ` | retry attempt ${newRetryCount} / ${task.retry} ` 
            + ` | ${task.result?.errors?.length ?? 0} errors`
            + ` | state: "${task.result?.state}"`
          );
          
          // report retried for the previous timeout failure, which won't
          // have been reported because the thread was killed to timeout
          await reportTestRetried(rpc, task, logModule, base);

          // increment the retry count (after reporting retried)
          task.result!.retryCount = newRetryCount;
          
          // retry timed out test
          //  - if it passes, process as normal.
          // if it fails again, it will end up below
          await runTest(
            rpc, port, base, collectCoverage, binary, sourceMap, debugInfo,
            task, logModule, poolOptions, bail, diffOptions
          );
        } else {
          debug(`${testLogPrefix} - Timed-out test has no retries left`
            + ` | retries attempted ${task.result?.retryCount || 0} / ${task.retry} ` 
            + ` | ${task.result?.errors?.length ?? 0} errors`
            + ` | state: "${task.result?.state}"`
          );

          await Promise.all([
            // as needed: invert if `fails`, bail
            postProcessTestResult(rpc, bail, task, testLogPrefix, logModule),
  
            reportTestFinished(rpc, task, logModule, base),
          ]);

          // ensure completed test will not be run again if another test
          // times out later and the file worker thread gets re-launched
          finalizeTestResult(task);
        }
      } else {
        debug(`${testLogPrefix} - Running test task | state: "${task.result?.state}"`);
        await runTest(
          rpc, port, base, collectCoverage, binary, sourceMap, debugInfo,
          task, logModule, poolOptions, bail, diffOptions
        );
      }

      // merge test coverage into suite coverage
      if (suiteMeta.coverageData && testTaskMeta.coverageData) {
        mergeCoverageData(suiteMeta.coverageData, testTaskMeta.coverageData);
      }
    }
  }

  // update suite result based on its tasks, report coverage data, report suite task result
  updateSuiteFinishedResult(suite, suiteLogPrefix);
  await reportSuiteFinished(rpc, suite, logModule, base);

  // ensure completed test will not be run again if another test
  // times out later and the file worker thread gets re-launched
  finalizeSuiteResult(suite);

  const suiteTime = performance.now() - suiteStart;
  debug(`${suiteLogPrefix} - Suite Run Complete | TIMING ${suiteTime.toFixed(2)} ms`);

  return suite;
}

export async function runFile(
  file: File,
  logModule: string,
  rpc: WorkerRPC,
  port: MessagePort,
  isCollectTestsMode: boolean,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  projectRoot: string,
  collectCoverage: boolean,
  relativeUserCoverageExclusions: string[],
  bail?: number,
  diffOptions?: SerializedDiffOptions,
  testNamePattern?: RegExp,
  allowOnly?: boolean,
  timedOutTest?: Test,
  timedOutCompilation?: WASMCompilation,
): Promise<void> {
  const base = basename(file.filepath);
  const fileLogPrefix = getTaskLogPrefix(logModule, base, file);
  const fileLogLabel = getTaskLogLabel(base, file);
  setDebugMode(poolOptions.debug);

  debug(`${fileLogPrefix} - Beginning runFile for "${file.filepath}" at ${Date.now()}`);

  const runStart = performance.now();
  let compilation: WASMCompilation | undefined = timedOutCompilation;

  try {
    if (!timedOutTest || !compilation) {
      await reportFileQueued(rpc, file, logModule, fileLogLabel);

      // TODO - move to options helpers
      const relativeTestFilePath = relative(projectRoot, file.filepath);
      const instrumentationOptions: InstrumentationOptions = {
        relativeExcludedFiles: [
          relativeTestFilePath,
          ...POOL_INTERNAL_PATHS,
          ...relativeUserCoverageExclusions,
        ],
        excludedLibraryFilePrefix: ASSEMBLYSCRIPT_LIB_PREFIX,
        coverageMemoryPagesMin: poolOptions.coverageMemoryPagesMin,
        coverageMemoryPagesMax: poolOptions.coverageMemoryPagesMax,
      };
      const compilerOptions: AssemblyScriptCompilerOptions = {
        stripInline: poolOptions.stripInline,
        projectRoot: projectRoot,
        shouldInstrument: collectCoverage,
        instrumentationOptions
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

      compilation = {
        filePath: file.filepath,
        binary,
        sourceMap,
        debugInfo,
      };
      const compiledMsg: TestFileCompiled = {
        compilation,
        type: 'file-compiled',
        [AS_POOL_WORKER_MSG_FLAG]: true
      };
      port.postMessage(compiledMsg);
      
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

      // if just collecting, consider the worker run done here
      if (isCollectTestsMode) {
        return;
      }
    } else {
      debug(`${fileLogPrefix} - Skipping re-compilation, using cached files`);
    }

    const { binary, sourceMap, debugInfo } = compilation;
    const execStart = performance.now();
    
    await runSuite(rpc, port, base, collectCoverage, binary, sourceMap, debugInfo, file, logModule, poolOptions, bail, diffOptions, timedOutTest);

    const execTime = performance.now() - execStart;
    debug(`${fileLogPrefix} - TIMING Execution Phase: ${execTime.toFixed(2)} ms`);

    const totalTime = performance.now() - runStart;
    debug(`${fileLogPrefix} - TIMING Total File Run: ${totalTime.toFixed(2)} ms`);
  } catch (error) {
    const poolError = createPoolErrorFromAnyError(
      `${fileLogLabel} - runFile failure in worker`,
      POOL_ERROR_NAMES.PoolError,
      error
    );
    const testError = getTestErrorFromPoolError(poolError);

    failFile(file, testError, runStart);

    await reportFileQueued(rpc, file, logModule, fileLogLabel);
    await reportFileError(rpc, file, logModule, fileLogLabel);
    await flushRpcUpdates(rpc);

    debug(`${fileLogPrefix} - Reported file error`);
  } finally {
    debug(`${fileLogPrefix} - runFile Completed`);
  }
}
