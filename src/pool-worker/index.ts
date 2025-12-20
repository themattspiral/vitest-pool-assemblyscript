/**
 * Worker entry point for Tinypool-based per-test parallelism
 *
 * This worker provides granular phase-specific functions:
 * - discoverTests: Discover tests from compiled binary
 * - executeTest: Execute a single test with RPC reporting
 * - executeTestWithCoverage: Execute a single test with coverage collection and RPC reporting
 * - reportFileSummary: Report file summary and coverage data after all tests complete
 *
 * The pool orchestrates these phases to enable pipeline parallelism with maximum CPU utilization.
 */

import { basename } from 'node:path';
import type { TaskResultPack, TaskEventPack } from '@vitest/runner';
import { interpretTaskModes } from '@vitest/runner/utils';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';

import type {
  DiscoverTestsTask,
  DiscoverTestsResult,
  ExecuteTestTask,
  ExecuteTestResult,
  ReportFileResultsTask,
  ReportFileFailureTask,
  ExecuteBeforeAllHooksTask,
  ExecuteAfterAllHooksTask,
  AssemblyScriptCoveragePayload,
  ReportTestFailureTask,
} from '../types/types.js';
import {
  COVERAGE_PAYLOAD_FORMATS,
  POOL_ERROR_NAMES,
} from '../types/constants.js';
import {
  discoverTests as discoverTestsFromExecutor,
  executeTest  as executeTestFromExecutor,
} from '../pool-executor/index.js';
import { setDebugMode, debug } from '../util/debug.js';
import { createPhaseTimings } from '../util/timing.js';
import {
  createRpcClient,
  createInitialFileTask,
  createRunFileTaskWithTestCases,
  reportFileQueued,
  reportSuitePrepare,
  reportFileCollected,
  reportTestPrepare,
  reportTestFinished,
} from './rpc-reporter.js';
import { createPoolErrorFromAnyError } from '../util/pool-errors.js';

// Singleton module cache for source map support in worker threads
// Shared across all tasks in this worker to enable accurate 
// internal pool code stack traces
const moduleCache = new ModuleCacheMap();

// Install source map support for pool's own TypeScript code
// This enables accurate stack traces when debugging the pool itself
installSourcemapsSupport({
  getSourceMap: source => moduleCache.getSourceMap(source),
});

/**
 * Discover tests from compiled binary
 *
 * Instantiates the WASM binary and executes _start to register tests.
 * Applies test name pattern filtering and returns filtered file task.
 * Reports RPC events: onQueued, onCollected, suite-prepare.
 *
 * Called via: pool.run(taskData, { name: 'discoverTests', transferList: [port] })
 *
 * @param taskData - Discovery task data
 * @returns File task with filtered tests, discovered tests, and discovery timings
 */
export async function discoverTests(taskData: DiscoverTestsTask): Promise<DiscoverTestsResult> {
  const base = basename(taskData.testFile);
  
  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker] discoverTests started for: "${taskData.testFile}"`);

    // Create RPC client
    const rpc = createRpcClient(taskData.port);

    // Create phase timings tracker for discovery
    const discoverTimings = createPhaseTimings();

    // Report onQueued
    const queuedFileTask = createInitialFileTask(taskData.testFile, taskData.projectInfo.projectRoot, taskData.projectInfo.projectName);
    await reportFileQueued(rpc, queuedFileTask);

    // Discover tests
    const { tests } = await discoverTestsFromExecutor(
      taskData.binary,
      taskData.sourceMap,
      base,
      taskData.poolOptions,
      taskData.defaultTestOptions,
      taskData.isBinaryInstrumented
    );
    discoverTimings.phaseEnd = performance.now();

    debug(`[TIMING] ${basename(taskData.testFile)} - discover: ${(discoverTimings.phaseEnd - discoverTimings.phaseStart).toFixed(2)}ms`);

    // Create complete file task for onCollected with duration metadata
    const collectedFileTask = createRunFileTaskWithTestCases(
      taskData.testFile,
      taskData.projectInfo,
      tests,
      taskData.compileTimings,
      discoverTimings
    );

    // Apply test name pattern filtering (from -t flag) before reporting to Vitest
    // This sets test.mode to 'skip' for tests that don't match the pattern
    interpretTaskModes(
      collectedFileTask,
      taskData.testNamePattern,
      undefined,  // testLocations
      false,      // onlyMode (will be detected from tasks)
      false,      // parentIsOnly
      taskData.allowOnly
    );

    const skippedCount = collectedFileTask.tasks.filter(t => t.mode === 'skip').length;
    if (skippedCount > 0) {
      debug(`[Worker] Filtered ${skippedCount}/${tests.length} tests`);
    }

    // Report onCollected with filtered tasks
    await reportFileCollected(rpc, collectedFileTask);

    // Report suite-prepare
    await reportSuitePrepare(rpc, collectedFileTask);

    debug(`[Worker] discoverTests complete for "${taskData.testFile}"`);

    return { fileTask: collectedFileTask, tests, discoverTimings };
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - discoverTests failure in worker`,
      POOL_ERROR_NAMES.WASMExecutionHarnessError,
      error
    );
  }
}

/**
 * Execute a single test
 */
export async function executeTest(taskData: ExecuteTestTask): Promise<ExecuteTestResult> {
  const workerStart = Date.now();
  const workerStartPerf = performance.now();
  const base = basename(taskData.testFile);

  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker] executeTest started for: "${taskData.test.name}"`);

    // Create RPC client from port
    const rpc = createRpcClient(taskData.port);

    // Report test-prepare
    const { testTaskId, testTaskName, testTaskMeta } = taskData;
    await reportTestPrepare(rpc, testTaskId, testTaskName, testTaskMeta);

    const testResult = await executeTestFromExecutor(
      workerStart,
      workerStartPerf,
      taskData.test,
      base,
      taskData.poolOptions,
      taskData.collectCoverage,
      taskData.binary,
      taskData.sourceMap,
      taskData.port,
      taskData.debugInfo,
      taskData.diffOptions
    );

    await reportTestFinished(rpc, testTaskId, testTaskName, testTaskMeta, testResult);

    debug(`[Worker] executeTest complete for: "${taskData.testTaskName}"`);

    return testResult;
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - executeTest failure in worker for test "${taskData.testTaskName}"`,
      POOL_ERROR_NAMES.WASMExecutionHarnessError,
      error
    );
  }
}

/**
 * Report file summary after all tests complete
 *
 * Reports suite-finished and final flush events to close out the file execution.
 * This is called after all tests in a file have completed.
 *
 * Called via: pool.run(taskData, { name: 'reportFileResults', transferList: [port] })
 *
 * @param taskData - File summary reporting task data
 * @returns void
 */
export async function reportFileResults(taskData: ReportFileResultsTask): Promise<void> {
  const base = basename(taskData.testFile);

  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker] reportFileSummary started for: "${taskData.testFile}"`);

    // Create RPC client
    const rpc = createRpcClient(taskData.port);

    // Report coverage if available
    if (taskData.coverageData) {
      debug(`[Worker] RPC Reporting coverage via onAfterSuiteRun for: "${taskData.testFile}"`);

      const coverage: AssemblyScriptCoveragePayload = {
        __format: COVERAGE_PAYLOAD_FORMATS.AssemblyScript,
        coverageData: taskData.coverageData,
      };
      await rpc.onAfterSuiteRun({
        coverage,
        testFiles: [taskData.testFile],
        transformMode: 'ssr',
        projectName: taskData.fileTask.projectName,
      });
    } else {
      debug(`[Worker] No coverage available to report via onAfterSuiteRun for: "${taskData.testFile}"`);
    }

    // Report suite-finished
    const fileTask = taskData.fileTask;
    const taskPack: TaskResultPack = [fileTask.id, fileTask.result!, fileTask.meta];
    const eventPack: TaskEventPack = [fileTask.id, 'suite-finished', undefined];

    debug(`[Worker] Reporting suite-finished for: "${taskData.testFile}"`);
    await rpc.onTaskUpdate([taskPack], [eventPack]);

    // Final flush
    debug('[Worker] Sending final flush');
    await rpc.onTaskUpdate([], []);

    debug('[Worker] reportFileSummary complete');
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - reportFileSummary failure in worker`,
      POOL_ERROR_NAMES.PoolReportingError,
      error
    );
  }
}

export async function reportPipelineFileFailure(taskData: ReportFileFailureTask): Promise<void> {
  const base = basename(taskData.testFile);

  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker] reportPipelineFileFailure started for: "${taskData.testFile}"`);

    const rpc = createRpcClient(taskData.port);

    debug(`[Worker] RPC Reporting onQueued with TestError (${taskData.error.name}) for: "${taskData.testFile}"`);
    
    const failedFileTask = createInitialFileTask(taskData.testFile, taskData.projectRoot, taskData.projectName);
    failedFileTask.result = {
      state: 'fail',
      errors: [taskData.error]
    };
    const now = performance.now();
    failedFileTask.prepareDuration = (taskData.compileTimings?.phaseEnd ?? now) - (taskData.compileTimings?.phaseStart ?? now - 1);
    failedFileTask.environmentLoad = 0;
    failedFileTask.setupDuration = 0;
    failedFileTask.collectDuration = 0;

    await reportFileQueued(rpc, failedFileTask);

    // Final flush
    await rpc.onTaskUpdate([], []);

    debug('[Worker] reportPipelineFileFailure complete');
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - reportPipelineFileFailure failure in worker`,
      POOL_ERROR_NAMES.PoolReportingError,
      error
    );
  }
}

export async function reportTestFailure(taskData: ReportTestFailureTask): Promise<void> {
  const base = basename(taskData.testFile);

  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker] reportTestFailure started for: "${taskData.test.name}"`);

    const rpc = createRpcClient(taskData.port);

    await reportTestFinished(rpc, taskData.testTaskId, taskData.testTaskName, taskData.testTaskMeta, taskData.result);

    // Final flush
    await rpc.onTaskUpdate([], []);

    debug('[Worker] reportTestFailure complete');
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - reportTestFailure failure in worker`,
      POOL_ERROR_NAMES.PoolReportingError,
      error
    );
  }
}

/**
 * Execute beforeAll hooks and report suite-prepare
 * Not yet implemented - placeholder for future hook support
 *
 * When implemented:
 * - Reports suite-prepare (moves from discoverTests)
 * - Executes beforeAll hooks sequentially
 * - Reports before-hook-start/end for each hook
 * - Blocks test execution until complete
 */
export async function executeBeforeAllHooks(taskData: ExecuteBeforeAllHooksTask): Promise<void> {
  setDebugMode(taskData.poolOptions.debug);
  debug('[Worker] executeBeforeAllHooks not yet implemented');
  throw createPoolErrorFromAnyError('executeBeforeAllHooks worker function', POOL_ERROR_NAMES.PoolError, 'executeBeforeAllHooks not yet implemented');
}

/**
 * Execute afterAll hooks
 * Not yet implemented - placeholder for future hook support
 *
 * When implemented:
 * - Executes afterAll hooks sequentially
 * - Reports after-hook-start/end for each hook
 * - Blocks suite-finished until complete
 */
export async function executeAfterAllHooks(taskData: ExecuteAfterAllHooksTask): Promise<void> {
  setDebugMode(taskData.poolOptions.debug);
  debug('[Worker] executeAfterAllHooks not yet implemented');
  throw createPoolErrorFromAnyError('executeAfterAllHooks worker function', POOL_ERROR_NAMES.PoolError, 'executeBeforeAllHooks not yet implemented');
}
