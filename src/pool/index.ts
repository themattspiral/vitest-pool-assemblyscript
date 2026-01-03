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
import type {
  Vitest,
  ProcessPool,
  TestProject,
  TestSpecification,
} from 'vitest/node';
import type { File, Task, Test } from '@vitest/runner/types';

import type {
  DiscoverTestsTask,
  ExecuteTestTask,
  ReportFileResultsTask,
  CoverageData,
  InstrumentationOptions,
  ResolvedHybridProviderOptions,
  ReportFileFailureTask,
  AssemblyScriptCompilerOptions,
  AssemblyScriptCompilerResult,
  CachedCompilation,
  AssemblyScriptTestError,
  AssemblyScriptResolvedConfig,
  AssemblyScriptTestOptions,
  TestExecutionStart,
  TestExecutionEnd,
  CompileSpecFileTask,
  CompileSpecFileResult,
  ReportTestFailuresTask,
  AssemblyScriptFileTaskMeta,
  AssemblyScriptTestTaskMeta,
  AssemblyScriptSuiteMeta,
} from '../types/types.js';
import {
  ASSEMBLYSCRIPT_LIB_PREFIX,
  ASSEMBLYSCRIPT_POOL_NAME,
  POOL_ERROR_NAMES,
  POOL_INTERNAL_PATHS,
} from '../types/constants.js';
import { setDebugMode, debug } from '../util/debug.js';
import { compileAssemblyScript } from '../compiler/index.js';
import { createWorkerChannel } from './worker-channel.js';
import { getAssemblyScriptResolvedConfig } from './options.js';
import { mergeCoverageData } from '../coverage-provider/coverage-merge.js';
import {
  createPoolError,
  createPoolErrorFromAnyError,
  createTestExpectedToFailError,
  createTestTimeoutError,
  getTestErrorFromPoolError,
  isAbortError,
  isAbortErrorString,
  throwPoolErrorIfAborted,
} from '../util/pool-errors.js';
import { positiveSum } from '../util/timing.js';
import { createInitialFileTask } from '../pool-worker/rpc-reporter.js';

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

// Aggregated coverage for each test file during execution
//   Key: test file path (e.g., math.as.test.ts)
//   Value: merged coverage from all tests in that file (organized by source file paths internally)
const pipelineCoverageByTestFile = new Map<string, CoverageData>();

// Compilation cache 
const pipelineCompileCacheByTestFile = new Map<string, CachedCompilation>();

// Single sequential compilation queue for V8 warmup
let compilationQueue = Promise.resolve({}) as Promise<CompileSpecFileResult>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Aggregate per-test coverage into per-test-file coverage for pipeline storage
 *
 * Takes coverage results from individual test executions (phase 3), merges them
 * by summing hit counts for each function, and stores the result in pipeline
 * storage for later reporting in phase 5.
 *
 */
function aggregateCoverageForTests(
  testFilePath: string,
  tasks: Task[],
): void {
  const base = basename(testFilePath);
  debug(`[Pipeline] ${base} - Aggregating per-test coverage into per-file coverage`);

  // Extract coverage data from each individual test result
  const perTestCoverage: CoverageData[] = tasks
    .filter(t => t.type === 'test' && (t.meta as AssemblyScriptTestTaskMeta).coverageData)
    .map(t => (t.meta as AssemblyScriptTestTaskMeta).coverageData!);

  if (perTestCoverage.length > 0) {
    // Merge all per-test coverage by summing hit counts for each position
    const testFileCoverage: CoverageData = {
      hitCountsByFileAndPosition: {},
    };

    // Use shared merge logic for each per-test coverage
    for (const testCoverage of perTestCoverage) {
      mergeCoverageData(testFileCoverage, testCoverage);
    }

    // Store in pipeline storage for phase 5 reporting
    const sourceFileCount = Object.keys(testFileCoverage.hitCountsByFileAndPosition).length;
    const positionCount = Object.values(testFileCoverage.hitCountsByFileAndPosition)
      .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
    debug(`[Pipeline] ${base} - Aggregated coverage: ${sourceFileCount} source files, ${positionCount} unique positions hit`);

    pipelineCoverageByTestFile.set(testFilePath, testFileCoverage);

    debug(`[Pipeline] ${base} - Coverage aggregation complete`);
  }
}


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
      const fileTask = createInitialFileTask(testFilePath, config.root, spec.project.name);
      fileTask.prepareDuration = compilerResult.compileTiming;

      debug(`[TIMING] ${base} - compileAssemblyScript total: ${compilerResult.compileTiming.toFixed(2)}ms`);

      return { compilerResult, fileTask };
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
  isCollectTestsMode: boolean
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

  try {
    const compileTask: CompileSpecFileTask = {
      testFilePath,
      shouldInstrument,
      relativeUserCoverageExclusions: (config.coverage as ResolvedHybridProviderOptions).globbedAssemblyScriptProjectRelativeExcludeOnly || [],
      poolOptions,
      port: workerPort,
      projectRoot: config.root,
      projectName: spec.project.name,
    };

    const result: CompileSpecFileResult = await pool.run(compileTask, {
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

  const defaultTestOptions: AssemblyScriptTestOptions = {
    timeout: config.testTimeout,
    retry: config.retry,
    fails: false,
    skip: false,
    only: false
  };

  const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);
  
  try {
    const discoverTask: DiscoverTestsTask = {
      cached,
      reportOnQueued,
      poolOptions,
      defaultTestOptions,
      port: workerPort,
      testNamePattern: config.testNamePattern,
      allowOnly: config.allowOnly,
    };

    const fileTask: File = await pool.run(discoverTask, {
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
  cached: CachedCompilation,
  test: Test,
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  signal: AbortSignal
): Promise<Test> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(cached.fileTask.filepath);

  debug(`[Pipeline] ${base} - Phase 3 Execute starting - Coverage: ${config.coverage.enabled}`);

  // used to abort this specific test's worker thread on timeout
  const testAbortController = new AbortController();
  const combinedSignal = AbortSignal.any([signal, testAbortController.signal]);

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
    const executeTask: ExecuteTestTask = {
      cached,
      test,
      collectCoverage: config.coverage.enabled,
      poolOptions,
      port: testWorkerPort,
      diffOptions,
      bail: config.bail,
    };

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
          
          const timeoutNow = Date.now();
          const elapsedFromWorkerExecutionStart = timeoutNow - workerExecutionStart!;

          (test.meta as AssemblyScriptTestTaskMeta).timedOut = true;
          const timeoutErr = createTestTimeoutError(test);

          if (test.result) {
            test.result.state = 'fail';
            test.result.startTime = workerExecutionStart;
            test.result.duration = elapsedFromWorkerExecutionStart;
            if (test.result.errors) {
              test.result.errors.push(timeoutErr)
            } else {
              test.result.errors = [timeoutErr];
            }
          } else {
            test.result = {
              state: 'fail',
              startTime: workerExecutionStart,
              duration: elapsedFromWorkerExecutionStart,
              errors: [timeoutErr],
              retryCount: 0,
            };
          }

          testAbortController.abort(POOL_ERROR_NAMES.WASMExecutionTimeoutError);

          debug(`[Pipeline] ${base} - "${test.name}": Timed out (threshold ${test.timeout}ms)`
            + ` - Aborted test worker job - Actual duration from worker exection start: ${elapsedFromWorkerExecutionStart}`
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

    dispatchTime = Date.now();
    const testAfterRun = await pool.run(executeTask, {
      name: 'executeTest',
      transferList: [testWorkerPort],
      signal: combinedSignal
    });

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

/**
 * Phase 5: Finalize file results and report summary
 *
 * Updates file task state based on actual test results and calls reportFileSummary worker function.
 * Uses the test results returned from Phase 3 (integrated) or Phase 4 (failsafe) to determine file state.
 * Throws on summary reporting failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param fileTask - File task from Vitest
 * @param testResults - Actual test results from Phase 3
 * @param project - Test project
 * @param config - Vitest resolved config
 * @param pool - Tinypool instance
 * @throws Error on summary reporting failure
 */
async function pipelineDispatchReportFileResults(
  filePipelineStart: number,
  fileTask: File,
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
): Promise<void> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(fileTask.filepath);

  const reportingStart = performance.now();

  // Update file task with final results based on actual returned test results
  const fileEndTime = Date.now();
  const hasFailures = fileTask.tasks.some(({ result }) => result?.state === 'fail' );

  if (fileTask.result) {
    fileTask.result.duration = positiveSum(fileTask.tasks, t => t.result?.duration);

    const meta: AssemblyScriptFileTaskMeta = { fullDuration: fileEndTime - filePipelineStart };
    fileTask.meta = meta;

    if (fileTask.mode === 'skip') {
      fileTask.result.state = 'skip';
    } else {
      fileTask.result.state = hasFailures ? 'fail' : 'pass';
    }
  }

  debug(`[Pipeline] ${base} - Calling reportFileResults - file duration: ${fileTask.result?.duration?.toFixed(2)}ms | file state: ${fileTask.result?.state}`);
  
  const { workerPort, poolPort } = createWorkerChannel(project, false);
  
  try {
    const summaryTask: ReportFileResultsTask = {
      poolOptions,
      port: workerPort,
      fileTask,
      coverageData: pipelineCoverageByTestFile.get(fileTask.filepath),
    };

    await pool.run(summaryTask, {
      name: 'reportFileResults',
      transferList: [workerPort],
      signal: poolAbortSignal,
    });

    debug(`[Pipeline] ${base} - reportFileResults completed`);
    debug(`[TIMING] ${base} - reportFileResults: ${(performance.now() - reportingStart).toFixed(2)}ms`);

  } finally {
    workerPort.close();
    poolPort.close();
  }
}

async function pipelineDispatchReportFileFailure(
  testFilePath: string,
  project: TestProject,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
  err: AssemblyScriptTestError,
  isCollectTestsMode: boolean,
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(testFilePath);

  const reportingStart = performance.now();

  debug(`[Pipeline] ${base} - Calling reportFileFailure | isCollectTestsMode: ${isCollectTestsMode}`);

  const { workerPort, poolPort } = createWorkerChannel(project, isCollectTestsMode);

  try {
    const taskData: ReportFileFailureTask = {
      error: err,
      testFile: testFilePath,
      poolOptions,
      port: workerPort,
      projectName: config.name,
      projectRoot: config.root,
      // TODO pass through compileTimings, discoveryTimings if applicable
    };

    await pool.run(taskData, {
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
    const taskData: ReportTestFailuresTask = {
      testTasks: timedOutTests,
      poolOptions,
      port: workerPort,
    };

    await pool.run(taskData, {
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
  //   debug('[Pool] Clearing coverage for invaldated files:');
  //   for (let i = 0; i < invalidCount; i++) {
  //     const file = invalidatedFiles![i]!;
  //     const clearedCoverage = pipelineCoverageByTestFile.delete(file);
  //     if (clearedCoverage) {
  //       debug(`[Pool]   [${i}] Cleared pipeline coverage cache for: "${file}"`);
  //     } else {
  //       debug(`[Pool]   [${i}] No pipeline coverage found in cache to clear for: "${file}"`);
  //     }
  //   }
  // }

  // Clear cache for invalidated files and bump generations
  // if (invalidatedFiles) {
  //   debug('[Pool] Clearing compilation cache for invaldated files');
  //   cache.invalidate(invalidatedFiles);
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
      let fileTask: File | undefined;

      if (useWorkerCompilation) {
        ({ compilerResult, fileTask } = await pipelineDispatchCompileSpecFile(spec, config, pool, signal, isCollectTestsMode));
      } else {
        ({ compilerResult, fileTask } = await pipelineQueueCompileSpecFile(spec, config, signal, isCollectTestsMode));
      }

      const p1Ms = Date.now() - p1Start;
      debug(`[TIMING] ${base} - Pipeline Phase 1: ${p1Ms}ms`);

      const cached: CachedCompilation = {
        filePipelineStart,
        fileTask,
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
        // resolves async promise so we just consider this pipeline done
        return;
      }
      
      let tasksToRun: Task[] = cached.fileTask.tasks.filter(t => t.type === 'test' && (t.mode === 'queued' || t.mode === 'run'));
      const finishedTasks: Task[] = [];

      const p3Start = Date.now();
      let executeLoopCount: number = 0;
      
      // EXECUTION PHASE - LOOP UNTIL WE'RE DONE WITH RETRIES
      while (tasksToRun.length > 0) {
        const loopStart = performance.now();
        executeLoopCount++;
        debug(`[Pipeline] ${base} - Execution loop ${executeLoopCount} starting`);

        // todo: suites!!
        const testPromises = tasksToRun
          .filter(t => t.type === 'test')
          .map(async (test: Test): Promise<Test> => {
            return pipelineDispatchRunTest(cached, test, config, spec.project, pool, signal);
          });
        
        
        const testsAfterRun = await Promise.all(testPromises);

        // invert any failed results for 'fails' tests not already inverted by the worker (e.g. timeouts)
        testsAfterRun.forEach(test => {
          if (test.result && test.fails && !(test.meta as AssemblyScriptTestTaskMeta).resultInverted) {
            debug(`[Pipeline] ${base} - executeTest "${test.name}" has 'fails' option set - inverting result "${test.result.state}"`);

            if (test.result.state === 'pass') {
              test.result.state = 'fail';
              (test.meta as AssemblyScriptTestTaskMeta).resultInverted = true;
              
              const err = createTestExpectedToFailError();
              if (test.result.errors) {
                test.result.errors.push(err);
              } else {
                test.result.errors = [err];
              }
            } else if (test.result.state === 'fail') {
              test.result.state = 'pass';
              test.result.errors = [];
              (test.meta as AssemblyScriptTestTaskMeta).resultInverted = true;
            }
          }
        });

        // find timed out tests as they won't have been reported already in either case:
        //   1) worker thread was aborted on timeout (hard)
        //   2) completed but should be marked timed out based on duration
        const timeouts = testsAfterRun.filter(test => {
          const meta = test.meta as AssemblyScriptTestTaskMeta;
          
          if (meta.timedOut) {
            debug(`[Pipeline] ${base} - "${test.name}": Hard Timeout (abort): ${test.result?.duration?.toFixed(2)}ms`);
            return true;
          } else if (!meta.timedOut && ((test.result?.duration || 0) > test.timeout)) {
            debug(`[Pipeline] ${base} - "${test.name}": Soft Timeout (completed but over threshold): ${test.result?.duration?.toFixed(2)}ms`);
            
            // these won't have been set as a failure by the executor in this edge case, so we do it here for proper reporting
            (test.meta as AssemblyScriptTestTaskMeta).timedOut = true;

            const timeoutErr = createTestTimeoutError(test);

            if (test.result) {
              test.result.state = 'fail';
              if (test.result.errors) {
                test.result.errors.push(timeoutErr)
              } else {
                test.result.errors = [timeoutErr];
              }
            } else {
              test.result = {
                state: 'fail',
                errors: [timeoutErr],
                retryCount: 0,
              };
            }
            
            return true;
          } else {
            return false;
          }
        });

        // report any test timeouts to vitest
        await pipelineDispatchReportTestTimeouts(testFilePath, timeouts, spec.project, config, pool, signal);

        // bucket finished tests vs failed tests which are configured to retry
        tasksToRun = [];
        testsAfterRun.forEach(test => {
          const willRetry: boolean =
            test.result?.state === 'fail'
            && test.retry !== undefined
            && test.retry > 0
            && (
              test.result.retryCount === undefined
              || test.result.retryCount === 0
              || (test.result.retryCount < test.retry)
            );

          if (willRetry) {
            // reset meta before retrying
            const meta = test.meta as AssemblyScriptTestTaskMeta;
            meta.assertionsPassedCount = 0;
            meta.assertionsFailed = [];
            meta.timedOut = false;
            meta.resultInverted = false;
            delete meta.lastError;
            delete meta.lastErrorValuesProvided;
            delete meta.lastErrorRawCallStack;
            delete meta.coverageData;

            // increment the retry count
            test.result!.retryCount = (test.result?.retryCount || 0) + 1;

            tasksToRun.push(test);

            debug(`[Pipeline] ${base} - "${test.name}": Submitting for retry ${test.result?.retryCount || 0} / ${test.retry} ` 
              + ` | ${test.result?.errors?.length ?? 0} errors`
            );
          } else {
            finishedTasks.push(test);

            debug(`[Pipeline] ${base} - "${test.name}": ${willRetry ? 'Submitting for retry' : 'Complete' } - ` 
              + ` Result ${test.result?.state} | ${test.result?.retryCount ?? 0} retries`
              + ` | ${test.result?.errors?.length ?? 0} errors`
            );
          }
        });

        debug(`[Pipeline] ${base} - Execution loop ${executeLoopCount} end: ${(performance.now() - loopStart).toFixed(2)}ms`);

        if (tasksToRun.length > 0) {
          debug(`[Pipeline] ${base} - Re-executing ${tasksToRun.length} failed tests configured with retry settings`);
        } else {
          debug(`[Pipeline] ${base} - Execution Phase Complete - No Retries`);
        }
      }

      const p3Ms = Date.now() - p3Start;
      debug(`[TIMING] ${base} - Pipeline Execution Loops: ${p3Ms}ms`);

      // PHASE 5: Finalize and report
      const p5Start = Date.now();
      // Aggregate per-test result coverage into per-test-file coverage for file-level reporting
      if (config.coverage) {
        aggregateCoverageForTests(testFilePath, finishedTasks);
      }

      // update all tasks on the fileTask with test results
      finishedTasks.forEach(task => {
        const meta = task.meta as AssemblyScriptSuiteMeta;
        cached.fileTask.tasks[meta.parentTaskIndex] = task;
      });

      await pipelineDispatchReportFileResults(filePipelineStart, cached.fileTask, config, spec.project, pool, signal);
      const p5End = Date.now();
      const p5Ms = p5End - p5Start;

      debug(() => (
          `[TIMING] ${base} - Pipeline Phase 5: ${p5Ms}ms\n`
        + `[TIMING] ${base} - Pipeline Phase 1-2 (prep): ${p2End - p1Start}ms\n`
        + `[TIMING] ${base} - Pipeline Phase 3-5 (exec/report): ${p5End - p3Start}ms\n`
        + `[TIMING] ${base} - Pipeline Total: ${p5End - p1Start}ms`
      ));
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
        await pipelineDispatchReportFileFailure(testFilePath, spec.project, config, pool, signal, testError, isCollectTestsMode);
      } catch (reportErr) {
        const poolReportError = createPoolErrorFromAnyError(`${base} - file pipeline failure reporting failure`,  POOL_ERROR_NAMES.PoolReportingError, reportErr);
        if (isAbortErrorString(poolReportError.name)) {
          debug(`[Pipeline] ${base} - file pipeline aborted during failure reporting`);
          // swallow abort error, this pipeline is done
          return;
        }

        throw reportErr;
      }

      // all errors either ignored, sent as a file failure, or thrown up if file failure report failed
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
      
      debug('[Pool] Clearing caches');
      pipelineCompileCacheByTestFile.clear();
      pipelineCoverageByTestFile.clear();

      debug('[Pool] Exiting');
    },
  };
}
