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

import { basename, relative } from 'node:path';
import { workerId } from 'tinypool';
import type { TaskResultPack, TaskEventPack } from '@vitest/runner';
import type { File, Test } from '@vitest/runner/types';
import { interpretTaskModes, someTasksAreOnly } from '@vitest/runner/utils';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';

import type {
  DiscoverTestsTask,
  ExecuteTestTask,
  ReportFileResultsTask,
  ReportFileFailureTask,
  ExecuteBeforeAllHooksTask,
  ExecuteAfterAllHooksTask,
  AssemblyScriptCoveragePayload,
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptConsoleLog,
  CompileSpecFileTask,
  InstrumentationOptions,
  AssemblyScriptCompilerOptions,
  TestExecutionStart,
  TestExecutionEnd,
  CompileSpecFileResult,
  ReportTestFailuresTask,
  AssemblyScriptTestTaskMeta,
} from '../types/types.js';
import {
  ASSEMBLYSCRIPT_LIB_PREFIX,
  COVERAGE_PAYLOAD_FORMATS,
  POOL_ERROR_NAMES,
  POOL_INTERNAL_PATHS,
} from '../types/constants.js';
import {
  executeWASMDiscovery,
  executeWASMTest,
} from '../pool-executor/index.js';
import { setDebugMode, debug } from '../util/debug.js';
import {
  createRpcClient,
  createInitialFileTask,
  reportFileQueued,
  reportSuitePrepare,
  reportFileCollected,
  reportTestPrepare,
  reportTestFinished,
  reportUserConsoleLogs,
  reportTestRetried,
} from './rpc-reporter.js';
import { createPoolErrorFromAnyError, createTestExpectedToFailError } from '../util/pool-errors.js';
import { compileAssemblyScript } from '../compiler/index.js';

// Singleton module cache for source map support in worker threads
// Shared across all tasks in this worker to enable accurate 
// internal pool code stack traces
const moduleCache = new ModuleCacheMap();

// Install source map support for pool's own TypeScript code
// This enables accurate stack traces when debugging the pool itself
installSourcemapsSupport({
  getSourceMap: source => moduleCache.getSourceMap(source),
});

let compilationCount: number = 0;

/**
 * Compile and instrument an AssemblyScript test file.
 *
 * Called via: pool.run(taskData, { name: 'compileFile', transferList: [port] })
 */
export async function compileSpecFile(taskData: CompileSpecFileTask): Promise<CompileSpecFileResult> {
  compilationCount++;

  const base = basename(taskData.testFilePath);
  
  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker ${workerId}] compileFile started for: "${taskData.testFilePath}"`);

    // Create RPC client
    const rpc = createRpcClient(taskData.port);

    const fileTask = createInitialFileTask(
      taskData.testFilePath,
      taskData.projectRoot,
      taskData.projectName
    );
    
    // Report onQueued
    await reportFileQueued(rpc, fileTask);

    // TODO - move to options helpers
    const instrumentationOptions: InstrumentationOptions = {
      relativeExcludedFiles: [
        relative(taskData.projectRoot, taskData.testFilePath),
        ...POOL_INTERNAL_PATHS,
        ...taskData.relativeUserCoverageExclusions,
      ],
      excludedLibraryFilePrefix: ASSEMBLYSCRIPT_LIB_PREFIX,
      coverageMemoryPagesMin: taskData.poolOptions.coverageMemoryPagesMin,
      coverageMemoryPagesMax: taskData.poolOptions.coverageMemoryPagesMax,
    };
    const compilerOptions: AssemblyScriptCompilerOptions = {
      stripInline: taskData.poolOptions.stripInline,
      projectRoot: taskData.projectRoot,
      shouldInstrument: taskData.shouldInstrument,
      instrumentationOptions
    };
    const compilerResult = await compileAssemblyScript(taskData.testFilePath, compilerOptions);

    debug(`[TIMING ${workerId}] comp #: ${compilationCount} | ${base} - compileAssemblyScript total: ${compilerResult.compileTiming.toFixed(2)}ms`);
    
    fileTask.prepareDuration = compilerResult.compileTiming;

    return { compilerResult, fileTask };
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - compileFile failure in worker`,
      POOL_ERROR_NAMES.WASMExecutionHarnessError,
      error
    );
  }
}

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
export async function discoverTests(taskData: DiscoverTestsTask): Promise<File> {
  const { port, reportOnQueued, poolOptions, cached } = taskData;
  const base = basename(cached.fileTask.filepath);
  
  try {
    setDebugMode(poolOptions.debug);
    debug(`[Worker ${workerId}] ${base} - discoverTests started for: "${cached.fileTask.filepath}"`);

    // Create RPC client
    const rpc = createRpcClient(port);

    const discoverStart = performance.now();

    // Report onQueued if indicated (may have already been reported by compile worker)
    if (reportOnQueued) {
      cached.fileTask.mode = 'queued';
      await reportFileQueued(rpc, cached.fileTask);
    }

    const logMessages: AssemblyScriptConsoleLog[] = [];
    const handleLog: AssemblyScriptConsoleLogHandler = (msg: string, isError: boolean = false): void => {
      logMessages.push({ msg, time: Date.now(), isError });
    };

    // Discover tests
    await executeWASMDiscovery(
      cached.binary,
      cached.sourceMap,
      base,
      poolOptions,
      taskData.defaultTestOptions,
      cached.isInstrumented,
      handleLog,
      cached.fileTask,
    );
    
    const discoverTiming = performance.now() - discoverStart;

    debug(`[TIMING ${workerId}] ${base} - discover: ${discoverTiming.toFixed(2)}ms`);
    
    // Add timing metadata
    cached.fileTask.collectDuration = discoverTiming;

    // Interpret task modes does the following:
    // 1. If only mode enabled on any test, flip all non-only test.mode to skip
    // 2. Apply test name pattern filtering (from -t flag) to skip if needed
    // 3. If all test modes are skip, set file task mode to skip
    const hasOnly = someTasksAreOnly(cached.fileTask);
    interpretTaskModes(
      cached.fileTask,
      taskData.testNamePattern,
      undefined,  // testLocations
      hasOnly,    // onlyMode
      false,      // parentIsOnly
      taskData.allowOnly
    );

    // Report results
    await Promise.all([
      // Report user console logs
      reportUserConsoleLogs(rpc, logMessages, cached.fileTask.id, cached.fileTask.filepath),

      // Report onCollected with filtered tasks
      reportFileCollected(rpc, cached.fileTask),
    ]);

    // set filetask result state to skip if the mode is skip, otherwise run
    cached.fileTask.result = {
      state: cached.fileTask.mode === 'skip' ? cached.fileTask.mode : 'run',
      startTime: Date.now(),
    };

    // Report suite-prepare (indicate the file suite is ready to run)
    await reportSuitePrepare(rpc, cached.fileTask);

    debug(`[Worker ${workerId}] ${base} - discoverTests complete for "${cached.fileTask.filepath}"`);

    return cached.fileTask;
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
export async function executeTest(taskData: ExecuteTestTask): Promise<Test> {
  const { cached, collectCoverage, test, poolOptions, diffOptions, port, bail } = taskData;
  const base = basename(cached.fileTask.filepath);

  try {
    setDebugMode(poolOptions.debug);
    debug(`[Worker ${workerId}] ${base} - executeTest started for: "${test.name}"`);

    // Create RPC client from port
    const rpc = createRpcClient(port);

    const logMessages: AssemblyScriptConsoleLog[] = [];
    const handleLog: AssemblyScriptConsoleLogHandler = (msg: string, isError: boolean = false): void => {
      logMessages.push({ msg, time: Date.now(), isError });
    };

    const executionStart = Date.now();
    const startMsg: TestExecutionStart = { executionStart };
    port.postMessage(startMsg);
    
    if (!test.retry || !test.result) {
      // first/only attempt: create test result and report test-prepare
      test.result = {
        state: 'run',
        startTime: executionStart,
        retryCount: 0
      };

      await reportTestPrepare(rpc, test);
    } else if (test.result) {
      test.result.state = 'run';
      test.result.startTime = executionStart;
    }

    const testAfterRun = await executeWASMTest(
      executionStart,
      test,
      cached,
      base,
      poolOptions,
      collectCoverage,
      handleLog,
      diffOptions
    );

    const endMsg: TestExecutionEnd = { executionEnd: Date.now() };
    port.postMessage(endMsg);

    if (testAfterRun.result && testAfterRun.result.state === 'run') {
      testAfterRun.result.state = 'pass';
    }

    if (testAfterRun.result && taskData.test.fails) {
      debug(`[Worker ${workerId}] executeTest "${testAfterRun.name}" has 'fails' option set - inverting result "${testAfterRun.result.state}"`);

      if (testAfterRun.result.state === 'pass') {
        testAfterRun.result.state = 'fail';
        (testAfterRun.meta as AssemblyScriptTestTaskMeta).resultInverted = true;
        
        const err = createTestExpectedToFailError();
        if (testAfterRun.result.errors) {
          testAfterRun.result.errors.push(err);
        } else {
          testAfterRun.result.errors = [err];
        }
      } else if (testAfterRun.result.state === 'fail') {
        testAfterRun.result.state = 'pass';
        testAfterRun.result.errors = [];
        (testAfterRun.meta as AssemblyScriptTestTaskMeta).resultInverted = true;
      }

      debug(`[Worker ${workerId}] executeTest "${testAfterRun.name}" has result after applying fails "${testAfterRun.result.state}"`);
    }

    if (bail && testAfterRun.result?.state !== 'pass') {
      const previousFailures = await rpc.getCountOfFailedTests();
      const currentFailures = 1 + previousFailures;

      if (currentFailures >= bail) {
        debug(`[Worker ${workerId}] executeTest "${testAfterRun.name}" BAIL: ${currentFailures} >= ${bail} failures`);
        rpc.onCancel('test-failure');
      }
    }

    const willRetry: boolean =
      testAfterRun.result?.state === 'fail'
      && testAfterRun.retry !== undefined
      && testAfterRun.retry > 0
      && (
        testAfterRun.result.retryCount === undefined
        || testAfterRun.result.retryCount === 0
        || (testAfterRun.result.retryCount < testAfterRun.retry)
      );
    
    // Report results
    await Promise.all([
      // Report user console logs
      reportUserConsoleLogs(rpc, logMessages, testAfterRun.id, testAfterRun.name),

      // Report test results
      willRetry
        ? reportTestRetried(rpc, testAfterRun)
        : reportTestFinished(rpc, testAfterRun)
    ]);

    debug(`[Worker ${workerId}] executeTest complete for: "${testAfterRun.name}"`);

    return testAfterRun;
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - executeTest failure in worker for test "${test.name}"`,
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
  const testFile = taskData.fileTask.filepath;
  const base = basename(testFile);

  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker ${workerId}] ${base} - reportFileResults started for: "${testFile}"`);

    // Create RPC client
    const rpc = createRpcClient(taskData.port);

    // Report coverage if available
    if (taskData.coverageData) {
      debug(`[Worker ${workerId}] ${base} - Reporting coverage via onAfterSuiteRun for: "${testFile}"`);

      const coverage: AssemblyScriptCoveragePayload = {
        __format: COVERAGE_PAYLOAD_FORMATS.AssemblyScript,
        coverageData: taskData.coverageData,
      };
      await rpc.onAfterSuiteRun({
        coverage,
        testFiles: [testFile],
        transformMode: 'ssr',
        projectName: taskData.fileTask.projectName,
      });
    } else {
      debug(`[Worker ${workerId}] ${base} - No coverage available to report via onAfterSuiteRun for: "${testFile}"`);
    }

    // Report suite-finished
    const fileTask = taskData.fileTask;
    const taskPack: TaskResultPack = [fileTask.id, fileTask.result, fileTask.meta];
    const eventPack: TaskEventPack = [fileTask.id, 'suite-finished', undefined];

    debug(`[Worker ${workerId}] ${base} - Reporting "suite-finished" for: "${testFile}" - result:`, fileTask.result?.state);
    await rpc.onTaskUpdate([taskPack], [eventPack]);

    // Final flush
    debug(`[Worker ${workerId}] ${base} - Sending final flush`);
    await rpc.onTaskUpdate([], []);

    debug(`[Worker ${workerId}] ${base} - reportFileResults complete`);
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - reportFileResults failure in worker`,
      POOL_ERROR_NAMES.PoolReportingError,
      error
    );
  }
}

export async function reportPipelineFileFailure(taskData: ReportFileFailureTask): Promise<void> {
  const base = basename(taskData.testFile);

  try {
    setDebugMode(taskData.poolOptions.debug);
    debug(`[Worker ${workerId}] reportPipelineFileFailure started for: "${taskData.testFile}"`);

    const rpc = createRpcClient(taskData.port);

    debug(`[Worker ${workerId}] Reporting onQueued with TestError (${taskData.error.name}) for: "${taskData.testFile}"`);
    
    const failedFileTask = createInitialFileTask(taskData.testFile, taskData.projectRoot, taskData.projectName);
    failedFileTask.result = {
      state: 'fail',
      errors: [taskData.error]
    };
    failedFileTask.prepareDuration = taskData.compileTiming ?? 0;
    failedFileTask.environmentLoad = 0;
    failedFileTask.setupDuration = 0;
    failedFileTask.collectDuration = taskData.discoverTiming ?? 0;

    await reportFileQueued(rpc, failedFileTask);

    // Final flush
    await rpc.onTaskUpdate([], []);

    debug(`[Worker ${workerId}] reportPipelineFileFailure complete`);
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - reportPipelineFileFailure failure in worker`,
      POOL_ERROR_NAMES.PoolReportingError,
      error
    );
  }
}

export async function reportTestFailures(taskData: ReportTestFailuresTask): Promise<void> {
  const { testTasks, poolOptions, port } = taskData;
  const file = testTasks.length > 0 ? testTasks[0]?.file.filepath ?? '' : '';
  const base = basename(file);

  try {
    setDebugMode(poolOptions.debug);
    debug(`[Worker ${workerId}] ${base} - reportTestFailure started for ${testTasks.length} tasks`);

    const rpc = createRpcClient(port);

    await Promise.all(testTasks.map(task => reportTestFinished(rpc, task)));

    // Final flush
    await rpc.onTaskUpdate([], []);

    debug(`[Worker ${workerId}] ${base} - reportTestFailure complete`);
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
  debug(`[Worker ${workerId}] executeBeforeAllHooks not yet implemented`);
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
  debug(`[Worker ${workerId}] executeAfterAllHooks not yet implemented`);
  throw createPoolErrorFromAnyError('executeAfterAllHooks worker function', POOL_ERROR_NAMES.PoolError, 'executeBeforeAllHooks not yet implemented');
}
