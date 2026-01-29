/**
 * Worker thread test runner logic for AssemblyScript Pool
 */

import type { MessagePort } from 'node:worker_threads';
import type { File, Suite, Task, Test } from '@vitest/runner/types';
import type { SerializedDiffOptions } from '@vitest/utils/diff';

import type {
  AssemblyScriptConsoleLog,
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestTaskMeta,
  ResolvedAssemblyScriptPoolOptions,
  TestExecutionEnd,
  TestExecutionStart,
  ThreadImports,
  VitestVersion,
  WASMCompilation,
  WorkerRPC,
} from '../../types/types.js';
import { AS_POOL_WORKER_MSG_FLAG } from '../../types/constants.js';
import { executeWASMTest } from '../../wasm-executor/index.js';
import { debug } from '../../util/debug.js';
import {
  reportTestPrepare,
  reportTestFinished,
  reportTestRetried,
  reportUserConsoleLogs,
  reportSuitePrepare,
  reportSuiteFinished,
} from '../rpc-reporter.js';
import {
  checkFailsAndInvertResult,
  finalizeSuiteResult,
  flagTestFinalized,
  getRunnableTasks,
  getTaskLogPrefix,
  resetTestForRetry,
  setSuitePrepareResult,
  setTestResultForTestPrepare,
  shouldRetryTask,
  updateSuiteFinishedResult,
  updateTestResultAfterRun,
  isSuiteOwnFile
} from '../../util/vitest-tasks.js';
import { mergeCoverageData } from '../../coverage-provider/coverage-merge.js';

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

function notifyTestStart(port: MessagePort, test: Test): void {
  port.postMessage({
    executionStart: Date.now(),
    test,
    type: 'execution-start',
    [AS_POOL_WORKER_MSG_FLAG]: true
  } satisfies TestExecutionStart);
}

function notifyTestEnd(port: MessagePort, test: Test): void {
  port.postMessage({
    executionEnd: Date.now(),
    testTaskId: test.id,
    type: 'execution-end',
    [AS_POOL_WORKER_MSG_FLAG]: true
  } satisfies TestExecutionEnd);
}

async function runTest(
  rpc: WorkerRPC,
  port: MessagePort,
  base: string,
  collectCoverage: boolean,
  compilation: WASMCompilation,
  test: Test,
  logModule: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  threadImports: ThreadImports,
  bail?: number,
  diffOptions?: SerializedDiffOptions,
): Promise<void> {
  const testLogPrefix = getTaskLogPrefix(logModule, base, test);
  const logMessages: AssemblyScriptConsoleLog[] = [];
  const handleLog: AssemblyScriptConsoleLogHandler = (msg: string, isError: boolean = false): void => {
    logMessages.push({ msg, time: Date.now(), isError });
  };

  const executionStart = Date.now();

  let thisRunIsARetry: boolean = false;
  let testPreparePromise: Promise<void> = Promise.resolve();
  
  if (!test.retry || !test.result) {
    debug(`${testLogPrefix} - Beginning test run`);

    // first/only attempt: create test result and report test-prepare
    setTestResultForTestPrepare(test, executionStart);
    testPreparePromise = reportTestPrepare(rpc, test, logModule, base);
  } else if (test.retry && test.result ) {
    debug(`${testLogPrefix} - Beginning test retry run`);
    thisRunIsARetry = true;

    // this is a retry, reset the result state and meta
    resetTestForRetry(test, executionStart);
  }
  
  // inform pool of test task start so it can enforce timeouts
  notifyTestStart(port, test);

  const [_reported, { testTimings }] = await Promise.all([
    testPreparePromise,
    executeWASMTest(
      test,
      compilation,
      base,
      poolOptions,
      collectCoverage,
      handleLog,
      logModule,
      threadImports,
      diffOptions
    )
  ]);

  // inform pool of test task end to stop timeout if under threshold
  notifyTestEnd(port, test);

  // update run->pass if appropriate, accumulate duration using executor timings
  updateTestResultAfterRun(test, testTimings);

  let willRetry = shouldRetryTask(test);

  await Promise.all([
    reportUserConsoleLogs(rpc, logMessages, logModule, base, test),

    willRetry ? reportTestRetried(rpc, test, logModule, base) : Promise.resolve(),
  ]);

  if (thisRunIsARetry) {
    debug(`${testLogPrefix} - Completed test retry run`);
    return;
  }

  // non-timeout retry handling
  while (willRetry) {
    // increment the retry count
    test.result!.retryCount = (test.result?.retryCount ?? 0) + 1;

    debug(`${testLogPrefix} - Retrying after failure`
      + ` | Retry ${test.result?.retryCount || 0} / ${test.retry} ` 
      + ` | ${test.result?.errors?.length ?? 0} errors`
    );

    await runTest(
      rpc, port, base, collectCoverage, compilation,
      test, logModule, poolOptions, threadImports, bail, diffOptions
    );

    willRetry = shouldRetryTask(test);

    if (!willRetry) {
      debug(`${testLogPrefix} - Max retries ${test.result?.retryCount || 0} / ${test.retry} ` 
      + ` | ${test.result?.errors?.length ?? 0} errors`
    );
    }
  }

  await Promise.all([
    // as needed: invert if `fails`, bail
    postProcessTestResult(rpc, bail, test, testLogPrefix, logModule),

    reportTestFinished(rpc, test, logModule, base),
  ]);

  // ensure completed test will not be run again if another test
  // times out later and the file worker thread gets re-launched
  flagTestFinalized(test);

  debug(`${testLogPrefix} - Completed test run`);
}

export async function runSuite(
  rpc: WorkerRPC,
  port: MessagePort,
  base: string,
  collectCoverage: boolean,
  compilation: WASMCompilation,
  suite: Suite | File,
  logModule: string,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  threadImports: ThreadImports,
  vitestVersion: VitestVersion,
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
    const threadRestartTime = Date.now() - ((timedOutTest?.meta as AssemblyScriptTestTaskMeta)?.lastTimeoutTerminationTime ?? 0);
    const showRestart = !!timedOutTest && isSuiteOwnFile(suite)
    debug(`${showRestart ? `(thread resumed in ${threadRestartTime} ms) ` : ''}${suiteLogPrefix} - runSuite ${!!timedOutTest
      ? `resuming after timeout "${timedOutTest.name}" | isTestInSuite: ${isTimedOutTestInSuite}`
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
  debug(`${suiteLogPrefix} - Runnable tasks:`, tasksToRun.length);

  for (const task of tasksToRun) {
    if (task.type === 'suite') {
      const suiteTaskMeta = task.meta as AssemblyScriptSuiteTaskMeta;

      await runSuite(
        rpc, port, base, collectCoverage, compilation, task, logModule,
        poolOptions, threadImports, vitestVersion, bail, diffOptions, timedOutTest
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
          //  - if it passes, process as normal
          //  - if it fails again, it will end up in the else block below
          await runTest(
            rpc, port, base, collectCoverage, compilation,
            task, logModule, poolOptions, threadImports, bail, diffOptions
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
          flagTestFinalized(task);

          debug(`${testLogPrefix} - Completed timed out test run`);
        }
      } else {
        debug(`${testLogPrefix} - Running test task | state: "${task.result?.state}"`);
        await runTest(
          rpc, port, base, collectCoverage, compilation,
          task, logModule, poolOptions, threadImports, bail, diffOptions
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
  await reportSuiteFinished(rpc, suite, logModule, base, vitestVersion);

  // ensure completed test will not be run again if another test
  // times out later and the file worker thread gets re-launched
  finalizeSuiteResult(suite);

  const suiteTime = performance.now() - suiteStart;
  debug(`${suiteLogPrefix} - Suite Run Complete | TIMING ${suiteTime.toFixed(2)} ms`);

  return suite;
}
