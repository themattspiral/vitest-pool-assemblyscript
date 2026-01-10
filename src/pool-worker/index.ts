/**
 * Worker entry point for Tinypool-based per-test parallelism
 */

import { basename, relative } from 'node:path';
import type { MessagePort } from 'node:worker_threads';
import { workerId } from 'tinypool';
import type { BirpcReturn } from 'birpc';
import type { RuntimeRPC } from 'vitest';
import type { File, Suite, Task, Test } from '@vitest/runner/types';
import type { SerializedDiffOptions } from '@vitest/utils/diff';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';

import type {
  ReportFileFailureTask,
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptConsoleLog,
  InstrumentationOptions,
  AssemblyScriptCompilerOptions,
  TestExecutionStart,
  TestExecutionEnd,
  RunFileTask,
  BinaryDebugInfo,
  ResolvedAssemblyScriptPoolOptions,
  AssemblyScriptTestTaskMeta,
  AssemblyScriptSuiteTaskMeta,
  WASMCompilation,
} from '../types/types.js';
import {
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
  createRpcClient,
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
import { createPoolErrorFromAnyError } from '../util/pool-errors.js';
import { compileAssemblyScript } from '../compiler/index.js';
import {
  checkFailsAndInvertResult,
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

const moduleCache = new ModuleCacheMap();
installSourcemapsSupport({
  getSourceMap: source => moduleCache.getSourceMap(source),
});

let compilationCount: number = 0;

export async function reportFileSuiteFailure(taskData: ReportFileFailureTask): Promise<void> {
  const { file, port, poolOptions } = taskData;
  const base = basename(file.filepath);
  const logModule = `Worker ${workerId}`;
  const logLabel = getTaskLogLabel(base, file);

  try {
    setDebugMode(poolOptions.debug);
    debug(`[${logModule}] ${logLabel} - reportFileSuiteFailure started for: "${file.filepath}"`);

    const errName = file.result?.errors ? (file.result.errors[0]?.name ?? 'undefined') : 'undefined';
    const rpc = createRpcClient(port);

    await reportFileQueued(rpc, file, logModule, logLabel);
    await reportFileError(rpc, file, logModule, logLabel);
    await flushRpcUpdates(rpc);

    debug(`[${logModule}] ${logLabel} - reportFileSuiteFailure complete for "${errName}"`);
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - reportFileSuiteFailure failure in worker`,
      POOL_ERROR_NAMES.PoolReportingError,
      error
    );
  }
}

async function runTest(
  rpc: BirpcReturn<RuntimeRPC>,
  port: MessagePort,
  base: string,
  collectCoverage: boolean,
  binary: Uint8Array,
  sourceMap: string,
  debugInfo: BinaryDebugInfo | undefined,
  test: Test,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  bail?: number,
  diffOptions?: SerializedDiffOptions,
): Promise<Test> {
  const workerModuleLabel = `Worker ${workerId}`;
  const testLogPrefix = getTaskLogPrefix(workerModuleLabel, base, test);
  const logMessages: AssemblyScriptConsoleLog[] = [];
  const handleLog: AssemblyScriptConsoleLogHandler = (msg: string, isError: boolean = false): void => {
    logMessages.push({ msg, time: Date.now(), isError });
  };

  // inform pool of test task start so it can enforce timeouts
  const executionStart = Date.now();
  const startMsg: TestExecutionStart = { executionStart, test };
  port.postMessage(startMsg);
  
  let testPreparePromise: Promise<void> = Promise.resolve();
  if (!test.retry || !test.result) {
    // first/only attempt: create test result and report test-prepare
    setTestPrepareResult(test, executionStart);
    testPreparePromise = reportTestPrepare(rpc, test, workerModuleLabel, base);
  } else if (test.result) {
    // this is a retry, reset the result state 
    resetTestResult(test, executionStart);
  }

  // do the test prepare message send and test execution async, so that the thread
  // doesn't explicitly wait on the prepare send to finish before beginning execution 
  const [_reported, { test: testAfterRun, timings }] = await Promise.all([
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
      workerModuleLabel,
      diffOptions
    )
  ]);

  // inform pool of test task end to stop timeout if under threshold
  const endMsg: TestExecutionEnd = { executionEnd: Date.now(), testTaskId: test.id };
  port.postMessage(endMsg);

  // set passed if appropriate, set duration
  updateTestFinishedResult(testAfterRun, timings);

  // invert result if test configured as 'fails'
  checkFailsAndInvertResult(testAfterRun, testLogPrefix);

  // check if we should bail now
  if (bail && testAfterRun.result?.state !== 'pass') {
    const previousFailures = await rpc.getCountOfFailedTests();
    const currentFailures = 1 + previousFailures;

    if (currentFailures >= bail) {
      debug(`${testLogPrefix} BAIL: ${currentFailures} >= ${bail} failures`);
      rpc.onCancel('test-failure');
    }
  }

  let willRetry = shouldRetryTask(testAfterRun);

  await Promise.all([
    reportUserConsoleLogs(rpc, logMessages, workerModuleLabel, base, testAfterRun),

    willRetry
      ? reportTestRetried(rpc, testAfterRun, workerModuleLabel, base)
      : reportTestFinished(rpc, testAfterRun, workerModuleLabel, base)
  ]);

  while (willRetry) {
    // reset meta before retrying
    resetTaskMeta(testAfterRun);

    // increment the retry count
    testAfterRun.result!.retryCount = (testAfterRun.result?.retryCount || 0) + 1;

    debug(`${testLogPrefix} - Retrying after failure`
      + ` | Retry ${testAfterRun.result?.retryCount || 0} / ${testAfterRun.retry} ` 
      + ` | ${testAfterRun.result?.errors?.length ?? 0} errors`
    );

    await runTest(rpc, port, base, collectCoverage, binary, sourceMap, debugInfo, testAfterRun, poolOptions, bail, diffOptions);

    willRetry = shouldRetryTask(testAfterRun);
  }

  // ensure completed test will not be run again if another test
  // times out later and the file worker thread gets re-launched
  finalizeTestResult(testAfterRun);

  return testAfterRun;
}

async function runSuite(
  rpc: BirpcReturn<RuntimeRPC>,
  port: MessagePort,
  base: string,
  collectCoverage: boolean,
  binary: Uint8Array,
  sourceMap: string,
  debugInfo: BinaryDebugInfo | undefined,
  suite: Suite | File,
  poolOptions: ResolvedAssemblyScriptPoolOptions,
  bail?: number,
  diffOptions?: SerializedDiffOptions,
  timedOutTest?: Test,
): Promise<Suite> {
  const suiteStart = performance.now();
  const workerModuleLabel = `Worker ${workerId}`;
  const suiteMeta = suite.meta as AssemblyScriptSuiteTaskMeta;
  const suiteLogPrefix = getTaskLogPrefix(workerModuleLabel, base, suite);
  const isTimedOutTestInSuite: boolean = timedOutTest?.suite?.id === suite.id;

  if (suiteMeta.resultFinal) {
    debug(`${suiteLogPrefix} - Skipping completed suite | state: "${suite.result?.state}"`);

    return suite;
  } else {
    debug(`${suiteLogPrefix} - runSuite ${!!timedOutTest
      ? `resuming after test timeout ("${timedOutTest.name}")`
      : 'beginning'
    }`);
  }

  if (!suiteMeta.suitePreparedSent) {
    setSuitePrepareResult(suite);
    await reportSuitePrepare(rpc, suite, workerModuleLabel, base);

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

      await runSuite(rpc, port, base, collectCoverage, binary, sourceMap, debugInfo, task, poolOptions, bail, diffOptions, timedOutTest);

      // merge suite task coverage into parent suite coverage
      if (suiteMeta.coverageData && suiteTaskMeta.coverageData) {
        mergeCoverageData(suiteMeta.coverageData, suiteTaskMeta.coverageData);
      }
      
    } else {
      const testLogPrefix = getTaskLogPrefix(workerModuleLabel, base, task);
      const testTaskMeta = task.meta as AssemblyScriptTestTaskMeta;

      if (testTaskMeta.resultFinal) {
        debug(`${testLogPrefix} - Skipping completed test | state: "${task.result?.state}"`);
      } else if (!!timedOutTest && task.id === timedOutTest.id) {
        if (shouldRetryTask(timedOutTest)) {
          debug(`${testLogPrefix} - Retrying after test timeout`
            + ` | retry ${timedOutTest.result?.retryCount || 0} / ${timedOutTest.retry} ` 
            + ` | ${timedOutTest.result?.errors?.length ?? 0} errors`
            + ` | state: "${timedOutTest.result?.state}"`
          );
          
          await reportTestRetried(rpc, timedOutTest, workerModuleLabel, base);

          // reset meta before retrying
          resetTaskMeta(timedOutTest);

          // increment the retry count
          timedOutTest.result!.retryCount = (timedOutTest.result?.retryCount || 0) + 1;
          
          // retry timed out test
          await runTest(rpc, port, base, collectCoverage, binary, sourceMap, debugInfo, task, poolOptions, bail, diffOptions);
        } else {
          debug(`${testLogPrefix} - Timed-out test has max retries`
            + ` | retry ${timedOutTest.result?.retryCount || 0} / ${timedOutTest.retry} ` 
            + ` | ${timedOutTest.result?.errors?.length ?? 0} errors`
            + ` | state: "${timedOutTest.result?.state}"`
          );

          updateTestFinishedResult(timedOutTest);
          await reportTestFinished(rpc, timedOutTest, workerModuleLabel, base);

          // ensure completed test will not be run again if another test
          // times out later and the file worker thread gets re-launched
          finalizeTestResult(timedOutTest);
        }
      } else {
        debug(`${testLogPrefix} - Running test task | state: "${task.result?.state}"`);
        await runTest(rpc, port, base, collectCoverage, binary, sourceMap, debugInfo, task, poolOptions, bail, diffOptions);
      }

      // merge test coverage into suite coverage
      if (suiteMeta.coverageData && testTaskMeta.coverageData) {
        mergeCoverageData(suiteMeta.coverageData, testTaskMeta.coverageData);
      }
    }
  }

  // update suite result based on its tasks, report coverage data, report suite task result
  updateSuiteFinishedResult(suite, suiteLogPrefix);
  await reportSuiteFinished(rpc, suite, workerModuleLabel, base);

  // ensure completed test will not be run again if another test
  // times out later and the file worker thread gets re-launched
  finalizeSuiteResult(suite);

  const suiteTime = performance.now() - suiteStart;
  debug(`${suiteLogPrefix} - Suite Run Complete | TIMING ${suiteTime.toFixed(2)}ms`);

  return suite;
}

export async function runFile(taskData: RunFileTask): Promise<void> {
  const { file, poolOptions, port, projectRoot, collectCoverage, bail, diffOptions, timedOutTest, timedOutCompilation } = taskData;
  const workerModuleLabel = `Worker ${workerId}`;
  const base = basename(file.filepath);
  const fileLogPrefix = getTaskLogPrefix(workerModuleLabel, base, file);
  const fileLogLabel = getTaskLogLabel(base, file);
  setDebugMode(poolOptions.debug);

  debug(`${fileLogPrefix} - Beginning runFile for "${file.filepath}" at ${Date.now()}`);

  const runStart = performance.now();
  const rpc = createRpcClient(port);
  let compilation: WASMCompilation | undefined = timedOutCompilation;

  try {
    if (!timedOutTest || !compilation) {
      await reportFileQueued(rpc, file, workerModuleLabel, fileLogLabel);

      // TODO - move to options helpers
      const relativeTestFilePath = relative(projectRoot, file.filepath);
      const instrumentationOptions: InstrumentationOptions = {
        relativeExcludedFiles: [
          relativeTestFilePath,
          ...POOL_INTERNAL_PATHS,
          ...taskData.relativeUserCoverageExclusions,
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
        workerModuleLabel,
        fileLogLabel
      );
      file.prepareDuration = compileTiming;
      compilationCount++;

      debug(`${fileLogPrefix} - TIMING compileAssemblyScript total `
        + `(worker comp # ${compilationCount}): ${compileTiming.toFixed(2)}ms`
      );

      compilation = {
        filePath: file.filepath,
        binary,
        sourceMap,
        debugInfo,
      }
      port.postMessage(compilation);
      
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
        workerModuleLabel,
        diffOptions
      );

      // set skips when using only and/or user test name pattern, skip file task if all tests skipped
      prepareFileTaskForCollection(file, taskData.testNamePattern, taskData.allowOnly);

      file.collectDuration = performance.now() - discoverStart;
      debug(`${fileLogPrefix} - TIMING Discovery Phase: ${file.collectDuration.toFixed(2)}ms`);

      // vitest collect - report discovery results
      await Promise.all([
        // Report user console logs
        reportUserConsoleLogs(rpc, logMessages, workerModuleLabel, base, file),

        // Report onCollected with collected and filtered tasks
        reportFileCollected(rpc, file, workerModuleLabel, fileLogLabel),
      ]);

      debug(() => `${fileLogPrefix} - Collected Test Suite Hierarchy:\n${getFullTaskHierarchy(file)}`);

      // if just collecting, consider the worker run done here
      if (taskData.isCollectTestsMode) {
        return;
      }
    }

    const { binary, sourceMap, debugInfo } = compilation;
    const execStart = performance.now();
    
    await runSuite(rpc, port, base, collectCoverage, binary, sourceMap, debugInfo, file, poolOptions, bail, diffOptions, timedOutTest);

    const execTime = performance.now() - execStart;
    debug(`${fileLogPrefix} - TIMING Execution Phase: ${execTime.toFixed(2)}ms`);

    const totalTime = performance.now() - runStart;
    debug(`${fileLogPrefix} - TIMING Total File Run: ${totalTime.toFixed(2)}ms`);
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - runFile failure in worker`,
      POOL_ERROR_NAMES.PoolError,
      error
    );
  }
}
