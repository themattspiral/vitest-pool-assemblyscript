/**
 * Worker entry point for Tinypool-based per-test parallelism
 */

import { basename, relative } from 'node:path';
import { workerId } from 'tinypool';
import type { File, Task, Test } from '@vitest/runner/types';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';

import type {
  DiscoverTestsTask,
  ExecuteTestTask,
  ReportSuiteEventTask,
  ReportFileFailureTask,
  ExecuteBeforeAllHooksTask,
  ExecuteAfterAllHooksTask,
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptConsoleLog,
  CompileSpecFileTask,
  InstrumentationOptions,
  AssemblyScriptCompilerOptions,
  TestExecutionStart,
  TestExecutionEnd,
  CompileSpecFileResult,
  ReportTestFailuresTask,
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
  reportSuiteLifecycleEvent,
  reportTestPrepare,
  reportTestFinished,
  reportTestRetried,
  reportUserConsoleLogs,
} from './rpc-reporter.js';
import { createPoolErrorFromAnyError } from '../util/pool-errors.js';
import { compileAssemblyScript } from '../compiler/index.js';
import {
  checkFailsAndInvertResult,
  createInitialFileTask,
  prepareFileTaskForCollection,
  resetTestResult,
  setTestPrepareResult,
  shouldRetryTask,
  updateTestFinishedResult
} from '../util/vitest-tasks.js';

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
      taskData.projectName,
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
    
    cached.fileTask.collectDuration = performance.now() - discoverStart;
    debug(`[TIMING ${workerId}] ${base} - discover: ${cached.fileTask.collectDuration.toFixed(2)}ms`);

    // set skips when using only and/or user test name pattert, skip file task if all tests skipped,
    prepareFileTaskForCollection(cached.fileTask, taskData.testNamePattern, taskData.allowOnly);

    debug(() => {
      const spacesForLevel = (level: number): string => new Array(level).fill('  ').join('');
      const taskStr = (task: Task, level: number): string => {
        if (task.type === 'test') {
          return `${spacesForLevel(level)}Mode: "${task.mode}" Test: "${task.name}"`;
        } else {
          const suiteStr = `${spacesForLevel(level)}Mode: "${task.mode}" Suite: "${task.name}"\n`;
          return suiteStr + task.tasks.map(t => taskStr(t, level + 1)).join('\n');
        }
      };
      return `[Worker ${workerId}] ${base} - discovered hierarchy:\n${taskStr(cached.fileTask, 0)}`;
    });

    // vitest collect - report discovery results
    await Promise.all([
      // Report user console logs
      reportUserConsoleLogs(rpc, logMessages, cached.fileTask.id, cached.fileTask.filepath),

      // Report onCollected with collected and filtered tasks
      reportFileCollected(rpc, cached.fileTask),
    ]);

    debug(`[Worker ${workerId}] ${base} - discoverTests complete for "${cached.fileTask.filepath}"`, cached.fileTask.mode);

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
    
    let needsTestPrepare = false;
    if (!test.retry || !test.result) {
      // first/only attempt: create test result and report test-prepare
      setTestPrepareResult(test, executionStart);
      needsTestPrepare = true;
    } else if (test.result) {
      // this is a retry, reset the result state 
      resetTestResult(test, executionStart);
    }

     const [_reported, { test: testAfterRun, timings }] = await Promise.all([
      needsTestPrepare ? reportTestPrepare(rpc, test) : Promise.resolve(),
      executeWASMTest(
        test,
        cached,
        base,
        poolOptions,
        collectCoverage,
        handleLog,
        diffOptions
      )
     ]);

    const endMsg: TestExecutionEnd = { executionEnd: Date.now() };
    port.postMessage(endMsg);

    // set passed if appropriate, set duration
    updateTestFinishedResult(testAfterRun, timings);

    // invert result if test configured as 'fails'
    checkFailsAndInvertResult(testAfterRun, base, `Worker ${workerId}`);

    // check if we should bail now
    if (bail && testAfterRun.result?.state !== 'pass') {
      const previousFailures = await rpc.getCountOfFailedTests();
      const currentFailures = 1 + previousFailures;

      if (currentFailures >= bail) {
        debug(`[Worker ${workerId}] executeTest "${testAfterRun.name}" BAIL: ${currentFailures} >= ${bail} failures`);
        rpc.onCancel('test-failure');
      }
    }

    const willRetry = shouldRetryTask(testAfterRun);
    
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

export async function reportSuiteEvent(taskData: ReportSuiteEventTask): Promise<void> {
  const { suite, event, port, poolOptions } = taskData;
  const base = basename(suite.file.filepath);
  const suiteLabel = suite.file.filepath === suite.name ? '' : `Suite: "${suite.name}" - `;

  try {
    setDebugMode(poolOptions.debug);
    debug(`[Worker ${workerId}] ${base} - ${suiteLabel}reportSuiteEvent "${event}" started`);

    // Create RPC client
    const rpc = createRpcClient(port);

    await reportSuiteLifecycleEvent(rpc, suite, event, base, suiteLabel);

    // Final flush
    debug(`[Worker ${workerId}] ${base} - ${suiteLabel}Sending final flush`);
    await rpc.onTaskUpdate([], []);

    debug(`[Worker ${workerId}] ${base} - ${suiteLabel}reportSuiteEvent "${event}" complete`);
  } catch (error) {
    throw createPoolErrorFromAnyError(
      `${base} - reportSuiteEvent failure in worker`,
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
