/**
 * AssemblyScript Pool for Vitest
 *
 * This pool implements pipeline parallelism so that each file flows through
 * its pipeline independently, maximizing CPU utilization and minimizing idle time,
 * while keeping each test execution confined to an isolated WASM instance.
 */

import { resolve, basename, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import Tinypool from 'tinypool';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';
import type { Vitest, ProcessPool, TestProject, TestSpecification } from 'vitest/node';
import type { File, Suite, Task, Test } from '@vitest/runner/types';

import {
  ASSEMBLYSCRIPT_LIB_PREFIX,
  ASSEMBLYSCRIPT_POOL_NAME,
  POOL_ERROR_NAMES,
  POOL_INTERNAL_PATHS,
} from '../types/constants.js';
import type {
  DiscoverTestsTask,
  ExecuteTestTask,
  CoverageData,
  InstrumentationOptions,
  ResolvedHybridProviderOptions,
  ReportFileFailureTask,
  AssemblyScriptCompilerOptions,
  AssemblyScriptCompilerResult,
  CachedCompilation,
  AssemblyScriptTestError,
  AssemblyScriptResolvedConfig,
  TestExecutionStart,
  TestExecutionEnd,
  CompileSpecFileTask,
  CompileSpecFileResult,
  ReportTestFailuresTask,
  AssemblyScriptTestTaskMeta,
  AssemblyScriptSuiteTaskMeta,
  ReportSuiteEventTask,
} from '../types/types.js';
import { setDebugMode, debug } from '../util/debug.js';
import { compileAssemblyScript } from '../compiler/index.js';
import { createWorkerChannel } from './worker-channel.js';
import { getAssemblyScriptResolvedConfig } from './options.js';
import { mergeCoverageData } from '../coverage-provider/coverage-merge.js';
import {
  createPoolError,
  createPoolErrorFromAnyError,
  getTestErrorFromPoolError,
  isAbortError,
  isAbortErrorString,
  throwPoolErrorIfAborted,
} from '../util/pool-errors.js';
import {
  checkAndUpdateSoftTimeout,
  checkFailsAndInvertResult,
  createFailedFileTask,
  createInitialFileTask,
  failTestWithTimeoutError,
  getRunnableTasks,
  getSuiteLogLabel,
  getTimedOutTests,
  resetTaskMeta,
  setSuitePrepareResult,
  shouldRetryTask,
  updateSuiteFinalResult,
} from '../util/vitest-tasks.js';

const WORKER_PATH = resolve(import.meta.dirname, 'pool-worker/index.mjs');

const WORKER_COMPILE_FILES_PER_THREAD_THRESHOLD = 4;

// ============================================================================
// Module-Level Pool Storage
// ============================================================================

/*
 * This data persists over multiple pool instantiations within the same vitest process,
 * which is how vitest re-executes on file changes in watch mode: A new pool is instantiated.
 * Note: No pool instance's close() function is called until the vitest process stops, 
 * so the data persists across multiple runs of runTests() in different pool instances. 
 */

// Compilation cache 
const pipelineCompileCacheByTestFile = new Map<string, CachedCompilation>();

// Single sequential compilation queue for V8 warmup
let compilationQueue = Promise.resolve({}) as Promise<CompileSpecFileResult>;


// ============================================================================
// Phase Functions
// ============================================================================

/**
 * Phase 1: Queue compilation sequentially in pool main thead so that compiler benefits from V8 JIT warmup.
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param config - Vitest resolved config
 * @param signal - abort signal
 * @param isCollectTestsMode - true when running a `collectTests()` operation only, false for full `runTests()`
 * @returns Promise that resolves with cached compilation
 */
async function pipelineQueueCompileSpecFile(
  spec: TestSpecification,
  config: AssemblyScriptResolvedConfig,
  signal: AbortSignal,
  isCollectTestsMode: boolean,
): Promise<CompileSpecFileResult> {
  const testFilePath = spec.moduleId;
  const base = basename(testFilePath);

  const currentCompilation = compilationQueue
    .catch(() => {
      debug(`[Pipeline] ${base} - queueCompilation rejection before queueing (ignoring previous error)`);
    })
    .then(async (): Promise<CompileSpecFileResult> => {
      throwPoolErrorIfAborted(signal);

      const poolOptions = config.poolOptions.assemblyScript;

      // set debug mode within this async context
      setDebugMode(poolOptions.debug);

      const isCoverageEnabled = config.coverage.enabled;

      // Only instrument when coverage is enabled and when not running a collectTests() operation
      const shouldInstrument = isCoverageEnabled && !isCollectTestsMode

      // TODO - move to options helpers
      const instrumentationOptions: InstrumentationOptions = {
        relativeExcludedFiles: [
          relative(config.root, testFilePath),
          ...POOL_INTERNAL_PATHS,
          ...((config.coverage as ResolvedHybridProviderOptions).globbedAssemblyScriptProjectRelativeExcludeOnly || []),
        ],
        excludedLibraryFilePrefix: ASSEMBLYSCRIPT_LIB_PREFIX,
        coverageMemoryPagesMin: poolOptions.coverageMemoryPagesMin,
        coverageMemoryPagesMax: poolOptions.coverageMemoryPagesMax,
      };
      const compilerOptions: AssemblyScriptCompilerOptions = {
        stripInline: poolOptions.stripInline,
        projectRoot: config.root,
        shouldInstrument: shouldInstrument,
        instrumentationOptions
      };
      const compilerResult = await compileAssemblyScript(testFilePath, compilerOptions, signal);

      // create the file task - a suite representing the file and all tests in the hierarchy
      const file = createInitialFileTask(testFilePath, spec.project.name, config);
      file.prepareDuration = compilerResult.compileTiming;

      debug(`[TIMING] ${base} - compileAssemblyScript total: ${compilerResult.compileTiming.toFixed(2)}ms`);

      return { compilerResult, file };
    })  
    .catch((err) => {
      throw createPoolErrorFromAnyError(`${base} - queueCompilation`, POOL_ERROR_NAMES.CompilationError, err);
    });

  compilationQueue = currentCompilation;

  return currentCompilation;
}

async function pipelineDispatchCompileSpecFile(
  spec: TestSpecification,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  signal: AbortSignal,
  isCollectTestsMode: boolean,
): Promise<CompileSpecFileResult> {
  
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);

  const testFilePath = spec.moduleId;
  const base = basename(testFilePath);

  debug(`[Pipeline] ${base} - Phase 1 (compile) starting`);

  const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);

  // Only instrument when coverage is enabled and when not running a collectTests() operation
  const shouldInstrument = config.coverage.enabled && !isCollectTestsMode;

  // create the file task - a suite representing the file and all tests in the hierarchy
  const file = createInitialFileTask(testFilePath, spec.project.name, config);

  try {
    const workerTaskData: CompileSpecFileTask = {
      testFilePath,
      shouldInstrument,
      relativeUserCoverageExclusions: (config.coverage as ResolvedHybridProviderOptions).globbedAssemblyScriptProjectRelativeExcludeOnly || [],
      poolOptions,
      port: workerPort,
      projectRoot: config.root,
      file
    };

    const result: CompileSpecFileResult = await pool.run(workerTaskData, {
      name: 'compileSpecFile',
      transferList: [workerPort],
      signal: signal
    });

    debug(`[Pipeline] ${base} - Phase 1 (compile) complete`);
    return result;
  } finally {
    workerPort.close();
    poolPort.close();
  }
}

/**
 * Phase 2: Discover tests in compiled binary
 * Always uses clean binary, populates cached.discoveredTests
 * Applies test name pattern filtering and returns file task with filtered tests
 * Throws on discovery failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param cached - Cached compilation
 * @param spec - Test specification
 * @param pool - Tinypool instance
 * @param isCollectTestsMode - true when running a `collectTests()` operation only, false for full `runTests()`
 * @returns File task with filtered tests (undefined in collectTests mode)
 * @throws Error on discovery failure
 */
async function pipelineDispatchRunDiscovery(
  spec: TestSpecification,
  cached: CachedCompilation,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  signal: AbortSignal,
  isCollectTestsMode: boolean,
  reportOnQueued: boolean
): Promise<File> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(cached.fileTask.filepath);

  debug(`[Pipeline] ${base} - Phase 2 (discover) starting`);

  const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);
  const diffOptions = typeof spec.project.serializedConfig.diff === 'object'
      ? spec.project.serializedConfig.diff : undefined; 

  try {
    const workerTaskData: DiscoverTestsTask = {
      cached,
      reportOnQueued,
      poolOptions,
      port: workerPort,
      testNamePattern: config.testNamePattern,
      allowOnly: config.allowOnly,
      diffOptions,
    };

    const fileTask: File = await pool.run(workerTaskData, {
      name: 'discoverTests',
      transferList: [workerPort],
      signal: signal
    });

    debug(`[Pipeline] ${base} - Phase 2 (discover) complete, found ${fileTask.tasks.length} tests`);
    return fileTask;
  } finally {
    workerPort.close();
    poolPort.close();
  }
}

/**
 * Phase 3: Execute test
 */
async function pipelineDispatchRunTest(
  test: Test,
  cached: CachedCompilation,
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  poolAbortSignal: AbortSignal
): Promise<Test> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(cached.fileTask.filepath);

  debug(`[Pipeline] ${base} - Phase 3 Execute starting - Coverage: ${config.coverage.enabled}`);

  // used to abort this specific test's worker thread on timeout
  const testAbortController = new AbortController();
  const combinedAbortSignal = AbortSignal.any([poolAbortSignal, testAbortController.signal]);

  // Create RPC channel for this test
  const { workerPort: testWorkerPort, poolPort: testPoolPort } = createWorkerChannel(project, false);

  let testTimeoutId: NodeJS.Timeout | undefined;
  let dispatchTime: number | undefined;
  let workerExecutionStart: number | undefined;

  try {
    debug(`[Pipeline] ${base} - "${test.name}": Dispatching executeTest`
      + ` | Retry: ${test.retry !== undefined && test.retry > 0 ? `${test.result?.retryCount ?? 0} / ${test.retry}` : 'n/a'}`
      + ` | Errors: ${test.result?.errors?.length ?? 0}`
    );

    const diffOptions = typeof project.serializedConfig.diff === 'object'
      ? project.serializedConfig.diff : undefined; 
    const workerTaskData: ExecuteTestTask = {
      cached,
      test,
      collectCoverage: config.coverage.enabled,
      poolOptions,
      port: testWorkerPort,
      diffOptions,
      bail: config.bail,
    };

    // Enforce test timeout using setTimeout() and worker messages.
    //   1. worker sends a start message to indicate when the test has started
    //   2. pool starts a timer using setTimeout() when worker start message is received
    //   3. worker sends an end message to indicate when the test has completed
    //     - if test completes before the timeout expires, the timer is cleared and everything proceeds
    //     - if timeout expires, the test worker is actively aborted using the test-specific AbortController
    //
    // This approach (monitoring from the pool main thread) allows for accurate enforcement of the timeout,
    // which is much harder to control from within the worker thread itself (which is busy running the WASM test).
    // Using messages for start/end execution times avoids the potentially substantial skew that would be caused by
    // worker jobs waiting queued to run when the next worker thread is not immediately available.
    testPoolPort.on('message', event => {
      if (event.executionStart) {
        const poolReceivedExecutionStart = Date.now();
        const workerTimings = event as TestExecutionStart;
        workerExecutionStart = workerTimings.executionStart;

        debug(`[Pipeline] ${base} - "${test.name}": Received worker execution start - Beginning test timeout timer ${test.timeout}ms`);

        const workerQueuedDuration = workerExecutionStart - dispatchTime!;
        debug(`[TIMING] ${base} - "${test.name}": Worker Queued ${workerQueuedDuration.toFixed(2)}ms`);
        
        const transitDuration = poolReceivedExecutionStart - workerExecutionStart;
        const adjustedTimeout = Math.max(test.timeout - transitDuration, 0);
        debug(`[TIMING] ${base} - "${test.name}": Execution start transit: ${transitDuration.toFixed(2)}ms | Adjusted timeout: ${adjustedTimeout}ms`);

        // Enforce test timeout
        testTimeoutId = setTimeout(() => {
          testTimeoutId = undefined;
          
          const poolTimeoutTime = Date.now();
          const elapsedFromWorkerExecutionStart = poolTimeoutTime - workerExecutionStart!;

          failTestWithTimeoutError(test, poolTimeoutTime, elapsedFromWorkerExecutionStart);

          testAbortController.abort(POOL_ERROR_NAMES.WASMExecutionTimeoutError);

          debug(`[Pipeline] ${base} - Test "${test.name}" timed out (threshold ${test.timeout}ms)`
            + ` - Aborted worker job (duration before abort: ${elapsedFromWorkerExecutionStart}ms)`
          );
        }, adjustedTimeout);
      } else if (event.executionEnd) {
        const poolReceivedExecutionEnd = Date.now();
        clearTimeout(testTimeoutId);
        testTimeoutId = undefined;

        const workerTimings = event as TestExecutionEnd;
        
        const elapsedFromWorkerExecutionStart = workerTimings.executionEnd - workerExecutionStart!;
        debug(`[Pipeline] ${base} - "${test.name}": Received worker execution end - Clear test timeout timer`
          + ` - Actual duration from worker exection start: ${elapsedFromWorkerExecutionStart}`
        );
        
        const transitDuration = poolReceivedExecutionEnd - workerTimings.executionEnd;
        debug(`[TIMING] ${base} - "${test.name}": Execution end transit: ${transitDuration.toFixed(2)}ms`);
      }
    });

    // Worker executes the test!
    dispatchTime = Date.now();
    const testAfterRun: Test = await pool.run(workerTaskData, {
      name: 'executeTest',
      transferList: [testWorkerPort],
      signal: combinedAbortSignal
    });

    // mark test as failed if it completed as passed, but its duration still execeeds the timeout threshold.
    // this may not have been set as failed by the worker in this edge case, so we do it here for proper reporting.
    checkAndUpdateSoftTimeout(testAfterRun, base, 'Pipeline');

    // invert result if test configured as 'fails'
    checkFailsAndInvertResult(testAfterRun, base, 'Pipeline');

    if (testTimeoutId) {
      clearTimeout(testTimeoutId);
      
      debug(`[Pipeline] ${base} - "${testAfterRun.name}": executeTest completed - Cleared test timeout timer that wasn't already cleared`
        + ` | Retry: ${testAfterRun.retry !== undefined && testAfterRun.retry > 0 ? `${testAfterRun.result?.retryCount ?? 0} / ${testAfterRun.retry}` : 'n/a'}`
        + ` | Errors: ${testAfterRun.result?.errors?.length ?? 0}`
      );
    } else {
      debug(`[Pipeline] ${base} - "${testAfterRun.name}": executeTest completed - test timeout timer already cleared`
        + ` | Retry: ${testAfterRun.retry !== undefined && testAfterRun.retry > 0 ? `${testAfterRun.result?.retryCount ?? 0} / ${testAfterRun.retry}` : 'n/a'}`
        + ` | Errors: ${testAfterRun.result?.errors?.length ?? 0}`
      );
    }

    return testAfterRun;
  } catch (error) {
    if (testTimeoutId) {
      clearTimeout(testTimeoutId);
    }
    
    if (isAbortError(error)) {
      debug(`[Pipeline] ${base} - "${test.name}": pipelineDispatchRunTests - caught abort error from test timeout - swallowing and returning the timeout result`);
      return test;
    } else {
      // executor captures test errors and adds them to the test result
      // so if we're here, it's because of something unexpected
      throw error;
    }
  } finally {
    testWorkerPort.close();
    testPoolPort.close();
  }
}

async function pipelineDispatchReportSuiteEvent(
  suite: Suite,
  event: 'suite-prepare' | 'suite-finished',
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
): Promise<void> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(suite.file.filepath);
  const suiteLabel = getSuiteLogLabel(suite);

  const reportingStart = performance.now();
  
  debug(`[Pipeline] ${base} - ${suiteLabel}Calling reportSuiteEvent "${event}" | result state: ${suite.result?.state}`);
  
  const { workerPort, poolPort } = createWorkerChannel(project, false);
  
  try {
    const workerTaskData: ReportSuiteEventTask = {
      suite,
      event,
      poolOptions,
      port: workerPort,
    };

    await pool.run(workerTaskData, {
      name: 'reportSuiteEvent',
      transferList: [workerPort],
      signal: poolAbortSignal,
    });

    debug(`[Pipeline] ${base} - ${suiteLabel}reportSuiteEvent "${event}" completed`);
    debug(`[TIMING] ${base} - ${suiteLabel}reportSuiteEvent: ${(performance.now() - reportingStart).toFixed(2)}ms`);

  } finally {
    workerPort.close();
    poolPort.close();
  }
}

async function pipelineDispatchReportFileFailure(
  spec: TestSpecification,
  error: AssemblyScriptTestError,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
  isCollectTestsMode: boolean,
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(spec.moduleId);

  const reportingStart = performance.now();

  debug(`[Pipeline] ${base} - Calling reportFileFailure | isCollectTestsMode: ${isCollectTestsMode}`);

  const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);

  // create the file task to report file failure
  const file = createFailedFileTask(spec.moduleId, spec.project.name, config, error);

  try {
    const workerTaskData: ReportFileFailureTask = {
      file,
      poolOptions,
      port: workerPort,
    };

    await pool.run(workerTaskData, {
      name: 'reportPipelineFileFailure',
      transferList: [workerPort],
      signal: poolAbortSignal
    });

    debug(`[Pipeline] ${base} - reportFileFailure completed`);
    debug(`[TIMING] ${base} - reportFileFailure: ${(performance.now() - reportingStart).toFixed(2)}ms`);

  } finally {
    workerPort.close();
    poolPort.close();
  }
}

async function pipelineDispatchReportTestTimeouts(
  testFilePath: string,
  timedOutTests: Test[],
  project: TestProject,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(testFilePath);

  debug(`[Pipeline] ${base} - pipelineDispatchReportTestTimeouts reporting ${timedOutTests.length} timeouts`);

  const reportingStart = performance.now();
  const { workerPort, poolPort } = createWorkerChannel(project, false);
    
  try {
    const workerTaskData: ReportTestFailuresTask = {
      testTasks: timedOutTests,
      poolOptions,
      port: workerPort,
    };

    await pool.run(workerTaskData, {
      name: 'reportTestFailures',
      transferList: [workerPort],
      signal: poolAbortSignal
    });
    
    debug(`[Pipeline] ${base} - pipelineDispatchReportTestTimeouts completed`);
    debug(`[TIMING] ${base} - pipelineDispatchReportTestTimeouts: ${(performance.now() - reportingStart).toFixed(2)}ms`);
  } finally {
    workerPort.close();
    poolPort.close();
  }
}


// ============================================================================
// Orchestration
// ============================================================================

async function runSuite(
  suite: Suite | File,
  cached: CachedCompilation,
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
): Promise<Suite> {
  const suiteCoverage: CoverageData = { hitCountsByFileAndPosition: {} };
  const suiteLabel = getSuiteLogLabel(suite);

  // create a task result for the suite
  setSuitePrepareResult(suite);

  // report that suite is prepared and starting to run
  await pipelineDispatchReportSuiteEvent(suite, 'suite-prepare', config, project, pool, poolAbortSignal);

  let tasksToRun: Task[] = getRunnableTasks(suite);
  const finishedTasks: Task[] = [];

  const p3Start = Date.now();
  let executeLoopCount: number = 0;
  
  // continue until there are no tasks left to run (e.g. needing retry)
  while (tasksToRun.length > 0) {
    const loopStart = performance.now();
    executeLoopCount++;
    debug(`[Pipeline] ${cached.base} - ${suiteLabel}Execution loop ${executeLoopCount} starting`);

    const tasksAfterRun = await Promise.all(
      tasksToRun.map(async (task: Task): Promise<Suite | Test> => {
        if (task.type === 'suite') {
          return runSuite(task, cached, config, project, pool, poolAbortSignal);
        } else {
          return pipelineDispatchRunTest(task, cached, config, project, pool, poolAbortSignal);
        }
      })
    );

    // find and report timed out tests as they won't have been reported already in either case:
    //  - worker thread was aborted because of timeout
    //  - completed as passed, but should be marked failed and timed out based on duration
    const timedOutTests = getTimedOutTests(tasksAfterRun);
    if (timedOutTests.length > 0) {
      await pipelineDispatchReportTestTimeouts(cached.fileTask.filepath, timedOutTests, project, config, pool, poolAbortSignal);
    }

    // bucket finished vs failed tasks which are configured to retry
    tasksToRun = [];
    tasksAfterRun.forEach(task => {
      const willRetry = shouldRetryTask(task);
      if (willRetry) {
        // reset meta before retrying
        resetTaskMeta(task);

        // increment the retry count
        task.result!.retryCount = (task.result?.retryCount || 0) + 1;

        tasksToRun.push(task);

        debug(`[Pipeline] ${cached.base} - ${suiteLabel}"${task.name}" - Submitting for retry`
          + ` ${task.result?.retryCount || 0} / ${task.retry} ` 
          + ` | ${task.result?.errors?.length ?? 0} errors`
        );
      } else {
        // accumulate suite coverage data
        const meta = task.meta as AssemblyScriptTestTaskMeta;
        if (meta.coverageData) {
          mergeCoverageData(suiteCoverage, meta.coverageData);
        }

        finishedTasks.push(task);

        debug(`[Pipeline] ${cached.base} - ${suiteLabel}"${task.name}" - Complete` 
          + ` | Result: ${task.result?.state} | ${task.result?.retryCount ?? 0} retries`
          + ` | ${task.result?.errors?.length ?? 0} errors | Collected Coverage: ${!!meta.coverageData}`
        );
      }
    });

    debug(`[Pipeline] ${cached.base} - ${suiteLabel}Execution loop ${executeLoopCount} end: ${(performance.now() - loopStart).toFixed(2)}ms`);

    if (tasksToRun.length > 0) {
      debug(`[Pipeline] ${cached.base} - ${suiteLabel}Re-executing ${tasksToRun.length} failed tests configured with retry settings`);
    } else {
      debug(`[Pipeline] ${cached.base} - ${suiteLabel}Execution Phase Complete - No Retries`);
    }
  }

  // update all tasks on the suite with their results from the worker runs,
  // because object mutations won't reflect across worker boundaries.
  finishedTasks.forEach(task => {
    const meta: AssemblyScriptTestTaskMeta | AssemblyScriptSuiteTaskMeta = task.type === 'suite'
      ? task.meta as AssemblyScriptSuiteTaskMeta
      : task.meta as AssemblyScriptTestTaskMeta;
    suite.tasks[meta.idxInParentTasks] = task;
  });

  // add coverage data if any is accumulated
  if (Object.keys(suiteCoverage.hitCountsByFileAndPosition).length > 0) {
    (suite.meta as AssemblyScriptSuiteTaskMeta).coverageData = suiteCoverage;
  }
  
  // update suite result based on its tasks
  updateSuiteFinalResult(suite, cached.base, 'Pipeline');

  // report the suite result
  await pipelineDispatchReportSuiteEvent(suite, 'suite-finished', config, project, pool, poolAbortSignal);

  const p3Ms = Date.now() - p3Start;
  debug(`[TIMING] ${cached.base} - ${suiteLabel}Pipeline Execution Loops: ${p3Ms}ms`);

  return suite;
}

/**
 * Run tests using pipeline parallelism
 * 
 * Each file flows through its pipeline independently: compile → discover → execute tests
 *
 * @param specs - Test specifications from Vitest
 * @param config - Vitest resolved config
 * @param cache - Compilation cache instance
 * @param pool - Tinypool instance
 * @param invalidatedFiles - Optional list of invalidated file paths
 */
async function runTests(
  specs: TestSpecification[],
  config: AssemblyScriptResolvedConfig,
  isCollectTestsMode: boolean,
  useWorkerCompilation: boolean,
  pool: Tinypool,
  poolAbortController: AbortController,
  _invalidatedFiles?: string[]
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);

  const mode = isCollectTestsMode ? 'collectTests' : 'runTests';
  debug(`[Pool] -------- ${mode} called for ${specs.length} specs --------`);

  if (isCollectTestsMode) {
    debug('[Pool] Clearing compilation cache before collectTests run');
    pipelineCompileCacheByTestFile.clear();
  }

  // TODO - invalidation
  // const invalidCount = invalidatedFiles?.length ?? 0;
  // debug('[Pool] Invalidated files:', invalidCount);

  // if (invalidCount > 0) {
  //   // probably:
  //   //   0. pre-build a cached map of source files to specs that import them (using debuginfo?)
  //   //   1. check if invalidated file is in map: if NOT ignore & continue loop to next file
  //   //   2. create file pipeline for each spec the invalidated file maps to
  // }

  // Create pipeline for each file
  const filePipelines: Promise<void>[] = specs.map(async (spec: TestSpecification): Promise<void> => {
    const filePipelineStart = Date.now();
    const testFilePath: string = spec.moduleId; // absolute path
    const base = basename(testFilePath);
    const { signal } = poolAbortController;

    // set debug mode within this async context
    setDebugMode(poolOptions.debug);
    debug(`[Pipeline] ${base} - Starting pipeline at ${filePipelineStart} for "${testFilePath}"`);

    try {
      const oldCompilation = pipelineCompileCacheByTestFile.get(testFilePath);
      if (oldCompilation) {
        debug(`[Pipeline] ${base} - Deleting pipeline cache for existing spec (started at: `
          + `${oldCompilation.filePipelineStart} tests: ${oldCompilation.fileTask.tasks.length}) before re-run`
        );
        
        pipelineCompileCacheByTestFile.delete(testFilePath);
      } else {
        debug(`[Pipeline] ${base} - NO existing pipeline cache for spec`);
      }

      // COMPILATION PHASE
      const p1Start = Date.now();
      
      let compilerResult: AssemblyScriptCompilerResult | undefined;
      let initialFileTask: File | undefined;

      if (useWorkerCompilation) {
        ({ compilerResult, file: initialFileTask } = await pipelineDispatchCompileSpecFile(spec, config, pool, signal, isCollectTestsMode));
      } else {
        ({ compilerResult, file: initialFileTask } = await pipelineQueueCompileSpecFile(spec, config, signal, isCollectTestsMode));
      }

      const p1Ms = Date.now() - p1Start;
      debug(`[TIMING] ${base} - Pipeline Phase 1: ${p1Ms}ms`);

      const cached: CachedCompilation = {
        filePipelineStart,
        fileTask: initialFileTask,
        base,
        binary: compilerResult.binary,
        sourceMap: compilerResult.sourceMap,
        debugInfo: compilerResult.debugInfo,
        isInstrumented: compilerResult.isInstrumented,
      };
      pipelineCompileCacheByTestFile.set(testFilePath, cached);

      // DISCOVERY PHASE
      const p2Start = Date.now();
      const reportOnQueued = !useWorkerCompilation;
      cached.fileTask = await pipelineDispatchRunDiscovery(spec, cached, config, pool, signal, isCollectTestsMode, reportOnQueued);
      const p2End = Date.now();
      const p2Ms = p2End - p2Start;
      debug(`[TIMING] ${base} - Pipeline Phase 2: ${p2Ms}ms`);
      debug(`[Pipeline] ${base} - Phase 2 complete, discovered ${cached.fileTask.tasks.length} tests`);

      if (isCollectTestsMode) {
        // consider this pipeline done - resolve async promise
        return;
      }
      
      // EXECUTION PHASE
      await runSuite(cached.fileTask, cached, config, spec.project, pool, signal);

      debug(`[TIMING] ${base} - File pipeline Total: ${Date.now() - p1Start}ms`
      );
    } catch (error) {
      if (isAbortError(error)) {
        debug(`[Pipeline] ${base} - file pipeline aborted during run`);
        // swallow abort error, this pipeline is done
        return;
      }

      const poolError = createPoolErrorFromAnyError(`${base} - file pipeline failure`, POOL_ERROR_NAMES.PoolError, error);
      const testError = getTestErrorFromPoolError(poolError);
      
      try {
        debug(`[Pipeline] ${base} - file pipeline failure - Reporting test file failure:`, testError);

        // report a failure for this suite
        await pipelineDispatchReportFileFailure(spec, testError, config, pool, signal, isCollectTestsMode);
      } catch (reportErr) {
        const poolReportError = createPoolErrorFromAnyError(`${base} - file pipeline failure reporting failure`,  POOL_ERROR_NAMES.PoolReportingError, reportErr);
        if (isAbortErrorString(poolReportError.name)) {
          debug(`[Pipeline] ${base} - file pipeline aborted during failure reporting`);
          // swallow abort error, this pipeline is done
          return;
        }

        throw reportErr;
      }

      // all errors either ignored, sent as a file failure, or thrown up if file failure report also failed
      return;
    } finally {
      debug(`[Pipeline] ${base} - Finished Pipeline Execution`);
    }
  });

  if (isCollectTestsMode) {
    try {
      await Promise.all(filePipelines);
      debug('[Pipeline] collectTests - All file pipelines resolved');
    } catch (err) {
      debug('[Pipeline] collectTests - File pipeline REJECTED, Calling Pool Abort to bail this collectTests run');
      poolAbortController.abort();
    }
  } else {
    const results = await Promise.allSettled(filePipelines);
    const unexpectedErrors: any[] = [];
    results.forEach(r => {
      if (r.status === 'rejected') {
        unexpectedErrors.push(r.reason);
      }
    });

    if (unexpectedErrors.length === 0) {
      debug(`[Pipeline] ${mode} - All file pipelines resolved`);
    } else {
      debug(`[Pipeline] ${mode} - Some file pipelines REJECTED unexpectedly. Throwing error(s) to vitest:`, unexpectedErrors);
      throw {
        name: POOL_ERROR_NAMES.PoolError,
        message: `Unexpected AssemblyScript Pool Error(s) Encountered during ${mode}`,
        cause: unexpectedErrors
      };
    }
  }

  debug(`[Pool] -------- ${mode} completed --------`);
}

export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  // Singleton module cache for source map support in worker threads
  // Shared across all tasks in this worker to enable accurate 
  // internal pool code stack traces
  const moduleCache = new ModuleCacheMap();

  // Install source map support for pool's own TypeScript code
  // This enables accurate stack traces when debugging the pool itself
  installSourcemapsSupport({
    getSourceMap: source => moduleCache.getSourceMap(source),
  });

  // Worker path resolution - worker must be pre-compiled JavaScript
  if (!existsSync(WORKER_PATH)) {
    throw createPoolError(`Worker file not found at ${WORKER_PATH}`, POOL_ERROR_NAMES.PoolError,);
  }

  // In multi-project mode, ctx.config is the global config, not the project-specific config
  // We need to find our project in ctx.projects to get project-specific poolOptions
  let projectConfig = ctx.config;
  let multiProjectName;
  
  if (ctx.projects && ctx.projects.length > 0) {
    // Multi-project mode: find the first project using this pool.
    // Use string.includes because project.config.pool resolves to the *path* of the dist file
    const project = ctx.projects.find(p => p.config.pool.includes(ASSEMBLYSCRIPT_POOL_NAME));

    if (project) {
      projectConfig = project.config;
      multiProjectName = project.name;
    }
  }

  // Resolve pool options and initialize debug mode
  const resolvedConfig = getAssemblyScriptResolvedConfig(ctx.config, projectConfig);
  const poolOptions = resolvedConfig.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);

  debug('[Pool] Initializing AssemblyScript Pool');

  if (multiProjectName) {
    debug(`[Pool] Multi-project mode: Using config from project: "${multiProjectName}"`);
  } else {
    debug('[Pool] Single-project mode: No project config found using vitest-pool-assemblyscript pool - Using global config with AssemblyScript pool defaults');
  }

  const maxThreads = poolOptions.maxThreads ?? availableParallelism() - 1;

  debug('[Pool] Worker path:', WORKER_PATH);
  debug(`[Pool] Worker configuration - maxThreads: ${maxThreads}`);

  // Initialize Tinypool for worker management
  const pool = new Tinypool({
    filename: WORKER_PATH,
    minThreads: 1,
    maxThreads,

    // Explicitly reuse worker threads - WASM instances are already isolated
    isolateWorkers: false,
  });

  // For explicitly terminating worker threads if needed
  const poolAbortController = new AbortController();

  // ctrl+c in terminal, or bail after test failures exceed bail count
  ctx.onCancel(reason => {
    const reasonMsg = reason === 'test-failure' ? 'Bail after test failure' : reason;
    console.log(`${ASSEMBLYSCRIPT_POOL_NAME} - Aborting all tests: ${reasonMsg}`);
    poolAbortController.abort();
  });

  return {
    name: ASSEMBLYSCRIPT_POOL_NAME,

    // runs when executing vitest list
    async collectTests(specs: TestSpecification[]) {
      const useWorkerCompilation = specs.length >= WORKER_COMPILE_FILES_PER_THREAD_THRESHOLD * maxThreads;
      const isCollectTestsMode = true;
      return runTests(specs, resolvedConfig, isCollectTestsMode, useWorkerCompilation, pool, poolAbortController);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      const useWorkerCompilation = specs.length >= WORKER_COMPILE_FILES_PER_THREAD_THRESHOLD * maxThreads;
      const isCollectTestsMode = false;
      return runTests(specs, resolvedConfig, isCollectTestsMode, useWorkerCompilation, pool, poolAbortController, invalidates);
    },

    // Cleanup when shutting down
    async close() {
      debug('[Pool] AbortController called');
      poolAbortController.abort();
      
      debug('[Pool] Tinypool destroyed');
      await pool.destroy();
      
      debug('[Pool] Clearing compilation cache');
      pipelineCompileCacheByTestFile.clear();

      debug('[Pool] Exiting');
    },
  };
}
