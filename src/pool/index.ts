/**
 * AssemblyScript Pool for Vitest
 *
 * This pool implements pipeline parallelism so that each file flows through
 * its pipeline independently, maximizing CPU utilization and minimizing idle time,
 * while keeping each test execution confined to an isolated WASM instance.
 */

import type {
  ProcessPool,
  Vitest,
  TestProject,
  TestSpecification,
  RunnerTestCase,
  RunnerTestFile,
} from 'vitest/node';
import { resolve, basename, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import Tinypool from 'tinypool';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';

import type {
  DiscoverTestsTask,
  DiscoverTestsResult,
  ExecuteTestTask,
  ExecuteTestResult,
  ReportFileResultsTask,
  CoverageData,
  ProjectInfo,
  PoolTestExecutionContext,
  InstrumentationOptions,
  ResolvedHybridProviderOptions,
  ReportFileFailureTask,
  AssemblyScriptCompilerOptions,
  CompileFileResult,
  CachedCompilation,
  AssemblyScriptTestError,
  AssemblyScriptResolvedConfig,
  AssemblyScriptTestOptions,
  ReportTestFailureTask,
  TestExecutionStart,
  TestExecutionEnd,
  CompileFileTask,
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
  createTestTimeoutError,
  getTestErrorFromPoolError,
  isAbortError,
  isAbortErrorString,
  throwPoolErrorIfAborted,
} from '../util/pool-errors.js';

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
let compilationQueue = Promise.resolve({}) as Promise<CompileFileResult>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract project information from TestSpecification
 *
 * @param spec - Test specification from Vitest
 * @returns Project information for file task creation
 */
function extractProjectInfo(spec: TestSpecification): ProjectInfo {
  const project: TestProject = spec.project;
  return {
    projectRoot: project.config.root,
    projectName: project.name,
    testTimeout: project.config.testTimeout,
  };
}

/**
 * Aggregate per-test coverage into per-test-file coverage for pipeline storage
 *
 * Takes coverage results from individual test executions (phase 3), merges them
 * by summing hit counts for each function, and stores the result in pipeline
 * storage for later reporting in phase 5.
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param testResults - Test results from phase 3 execution
 */
function aggregateCoverageForTestFile(
  testFilePath: string,
  testResults: PoolTestExecutionContext[]
): void {
  const base = basename(testFilePath);
  debug(`[Pipeline] ${base} - Aggregating per-test coverage into per-file coverage`);

  // Extract coverage data from each individual test result
  const perTestCoverage = testResults
    .map(({ result }) => result.coverage)
    .filter((cov): cov is CoverageData => cov !== undefined);

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
async function pipelineQueueCompilation(
  testFilePath: string,
  config: AssemblyScriptResolvedConfig,
  signal: AbortSignal,
  isCollectTestsMode: boolean,
): Promise<CompileFileResult> {
  const base = basename(testFilePath);
  const currentCompilation = compilationQueue
    .catch(() => {
      debug(`[Pipeline] ${base} - queueCompilation rejection before queueing (ignoring previous error)`);
    })
    .then(async (): Promise<CompileFileResult> => {
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
      const compileResult = await compileAssemblyScript(testFilePath, compilerOptions, signal);

      debug(`[TIMING] ${base} - compileAssemblyScript total: ${compileResult.compileTiming.toFixed(2)}ms`);

      return compileResult;
    })  
    .catch((err) => {
      throw createPoolErrorFromAnyError(`${base} - queueCompilation`, POOL_ERROR_NAMES.CompilationError, err);
    });

  compilationQueue = currentCompilation;

  return currentCompilation;
}

async function pipelineDispatchCompileFile(
  spec: TestSpecification,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  signal: AbortSignal,
  isCollectTestsMode: boolean
): Promise<CompileFileResult> {
  
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(spec.moduleId);

  debug(`[Pipeline] ${base} - Phase 1 (compile) starting`);

  const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);
  const projectInfo = extractProjectInfo(spec);

  // Only instrument when coverage is enabled and when not running a collectTests() operation
  const shouldInstrument = config.coverage.enabled && !isCollectTestsMode;

  try {
    const compileTask: CompileFileTask = {
      testFilePath: spec.moduleId,
      shouldInstrument,
      relativeUserCoverageExclusions: (config.coverage as ResolvedHybridProviderOptions).globbedAssemblyScriptProjectRelativeExcludeOnly || [],
      poolOptions,
      port: workerPort,
      projectInfo,
    };

    const result: CompileFileResult = await pool.run(compileTask, {
      name: 'compileFile',
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
  isCollectTestsMode: boolean
): Promise<DiscoverTestsResult> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(cached.testFilePath);

  debug(`[Pipeline] ${base} - Phase 2 (discover) starting`);

  const projectInfo = extractProjectInfo(spec);
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
      binary: cached.binary,
      sourceMap: cached.sourceMap,
      isBinaryInstrumented: cached.isInstrumented,
      testFile: cached.testFilePath,
      poolOptions,
      defaultTestOptions,
      port: workerPort,
      projectInfo,
      compileTiming: cached.compileTiming,
      debugInfo: cached.debugInfo,
      testNamePattern: config.testNamePattern,
      allowOnly: config.allowOnly,
    };

    const results: DiscoverTestsResult = await pool.run(discoverTask, {
      name: 'discoverTests',
      transferList: [workerPort],
      signal: signal
    });

    debug(`[Pipeline] ${base} - Phase 2 (discover) complete, found ${Object.keys(results.tests).length} tests`);
    return results;
  } finally {
    workerPort.close();
    poolPort.close();
  }
}

/**
 * Phase 3: Execute all tests for this file
 * Coverage-aware: Uses clean binary when coverage disabled, instrumented binary when enabled
 * Returns test results (with coverage data if coverage enabled)
 * Throws on test execution failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param cached - Cached compilation
 * @param testTasks - Array of test tasks to execute
 * @param project - Test project
 * @param config - Vitest resolved config
 * @param pool - Tinypool instance
 * @returns Array of test results with coverage data
 * @throws Error on test execution failure
 */
async function pipelineDispatchRunTests(
  cached: CachedCompilation,
  testContexts: PoolTestExecutionContext[],
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  signal: AbortSignal
): Promise<PoolTestExecutionContext[]> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(cached.testFilePath);

  debug(`[Pipeline] ${base} - Phase 3 Execute starting - Coverage: ${config.coverage.enabled}`);
  const testFileSuiteStart = performance.now();

  const testExecutions = testContexts.map(async (context): Promise<PoolTestExecutionContext> => {
    // used to abort this specific test's worker thread on timeout
    const testAbortController = new AbortController();
    const combinedSignal = AbortSignal.any([signal, testAbortController.signal]);
    let timedOutResult: ExecuteTestResult | undefined;

    // Create RPC channel for this test
    const { workerPort: testWorkerPort, poolPort: testPoolPort } = createWorkerChannel(project, false);

    // executeCount is current before we start
    // retryCount is what retry we will be on as/after we execute this run
    // retryCount is current_executeCount + 1 (to count this run) - 1 (don't count first run)
    // so retryCount = executeCount if we will be retrying at all
    context.retryCount = context.test.options.retry > 0 ? context.executeCount : undefined;

    let testTimeoutId: NodeJS.Timeout | undefined;
    let dispatchTime: number | undefined;
    let workerExecutionStart: number | undefined;

    try {
      debug(`[Pipeline] ${base} - "${context.test.name}": Dispatching executeTest (${context.executeCount} executions)`
        + ` | Execution: ${context.executeCount + 1}`
        + ` | Retry: ${context.test.options.retry > 0 ? `${context.retryCount ?? 0} / ${context.test.options.retry}` : 'n/a'}`
        + ` | Errors: ${context.allResultErrors.length}`
      );

      const diffOptions = typeof project.serializedConfig.diff === 'object'
        ? project.serializedConfig.diff : undefined; 
      const executeTask: ExecuteTestTask = {
        collectCoverage: config.coverage.enabled,
        binary: cached.binary,
        sourceMap: cached.sourceMap,
        debugInfo: cached.debugInfo,
        test: context.test,
        testFile: cached.testFilePath,
        poolOptions,
        port: testWorkerPort,
        testTaskId: context.testTask.id,
        testTaskName: context.testTask.name,
        testTaskMeta: context.testTask.meta,
        diffOptions,
        allResultErrors: context.allResultErrors,
        retryCount: context.retryCount,
        contextExecutionStart: context.executionStart,
        bail: config.bail,
      };

      testPoolPort.on('message', event => {
        if (event.executionStart) {
          const poolReceivedExecutionStart = Date.now();
          const workerTimings = event as TestExecutionStart;
          workerExecutionStart = workerTimings.executionStart;

          debug(`[Pipeline] ${base} - "${context.test.name}": Received worker execution start - Beginning test timeout timer ${context.test.options.timeout}ms`);

          const workerQueuedDuration = workerTimings.workerStart - dispatchTime!;
          debug(`[TIMING] ${base} - "${context.test.name}": Worker Queued ${workerQueuedDuration.toFixed(2)}ms | Worker Init ${workerTimings.workerOverhead.toFixed(2)}ms`);
          
          const transitDuration = poolReceivedExecutionStart - workerExecutionStart;
          const adjustedTimeout = Math.max(context.test.options.timeout - transitDuration, 0);
          debug(`[TIMING] ${base} - "${context.test.name}": Execution start transit: ${transitDuration.toFixed(2)}ms | Adjusted timeout: ${adjustedTimeout}ms`);

          // Enforce test timeout
          testTimeoutId = setTimeout(() => {
            testAbortController.abort(POOL_ERROR_NAMES.WASMExecutionTimeoutError);
            
            const timeoutNow = Date.now();
            const elapsedFromWorkerExecutionStart = timeoutNow - workerExecutionStart!;

            debug(`[Pipeline] ${base} - "${context.test.name}": Timed out (threshold ${context.test.options.timeout}ms)`
              + ` - Aborted test worker job - Actual duration from worker exection start: ${elapsedFromWorkerExecutionStart}`
            );

            timedOutResult = {
              name: context.test.name,
              passed: false,
              timedOut: true,
              assertionsPassed: 0,
              assertionsFailed: 0,
              duration: elapsedFromWorkerExecutionStart,
              startTime: context.executionStart,
              error: createTestTimeoutError(context.test),
            };
            context.allResultErrors.push(timedOutResult.error!);

            testTimeoutId = undefined;
          }, adjustedTimeout);
        } else if (event.executionEnd) {
          const poolReceivedExecutionEnd = Date.now();
          clearTimeout(testTimeoutId);
          testTimeoutId = undefined;

          const workerTimings = event as TestExecutionEnd;
          
          const elapsedFromWorkerExecutionStart = workerTimings.executionEnd - workerExecutionStart!;
          debug(`[Pipeline] ${base} - "${context.test.name}": Received worker execution end - Clear test timeout timer`
            + ` - Actual duration from worker exection start: ${elapsedFromWorkerExecutionStart}`
          );
          
          const transitDuration = poolReceivedExecutionEnd - workerTimings.executionEnd;
          debug(`[TIMING] ${base} - "${context.test.name}": Execution end transit: ${transitDuration.toFixed(2)}ms`);
        }
      });

      context.executeCount++;
      dispatchTime = Date.now();
      context.result = await pool.run(executeTask, {
        name: 'executeTest',
        transferList: [testWorkerPort],
        signal: combinedSignal
      });

      // copy any result error to running error context
      if (context.result.error) {
        context.allResultErrors.push(context.result.error);
      }

      if (testTimeoutId) {
        clearTimeout(testTimeoutId);
        debug(`[Pipeline] ${base} - "${context.test.name}": executeTest run completed - Cleared test timeout timer that wasn't already cleared`
          + ` | Execution: ${context.executeCount}`
          + ` | Retry: ${context.test.options.retry > 0 ? `${context.retryCount ?? 0} / ${context.test.options.retry}` : 'n/a'}`
          + ` | Errors: ${context.allResultErrors.length}`
        );
      } else {
        debug(`[Pipeline] ${base} - "${context.test.name}": executeTest run completed - test timeout timer already cleared`
          + ` | Execution: ${context.executeCount}`
          + ` | Retry: ${context.test.options.retry > 0 ? `${context.retryCount ?? 0} / ${context.test.options.retry}` : 'n/a'}`
          + ` | Errors: ${context.allResultErrors.length}`
        );
      }

      return context;
    } catch (error) {
      if (testTimeoutId) {
        clearTimeout(testTimeoutId);
      }
      
      if (isAbortError(error) && timedOutResult) {
        debug(`[Pipeline] ${base} - "${context.test.name}": pipelineDispatchRunTests - caught abort error from test timeout - swallowing and returning the timeout result`);
        context.result = timedOutResult;
        return context;
      } else {
        // executor captures test errors and adds them to the test result
        // so if we're here, it's because of something unexpected
        throw error;
      }
    } finally {
      testWorkerPort.close();
      testPoolPort.close();
    }
  });

  // Wait for all tests in this file to complete
  const testResults = await Promise.all(testExecutions);

  debug(`[Pipeline] ${base} - Phase 3 (execute) complete`);
  debug(`[TIMING] ${base} - test execution phase: ${(performance.now() - testFileSuiteStart).toFixed(2)}ms`);

  return testResults;
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
  testFilePath: string,
  filePipelineStart: number,
  fileTask: RunnerTestFile,
  testResults: PoolTestExecutionContext[],
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
): Promise<void> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(testFilePath);

  const reportingStart = performance.now();

  // Update file task with final results based on actual returned test results
  const fileEndTime = Date.now();
  const hasFailures = testResults.some(({ result }) => !result.passed);

  // Check if all tests in the file were skipped
  const allTestsSkipped = fileTask.tasks.length > 0 &&
    fileTask.tasks.every(t => t.mode === 'skip');

  if (fileTask.result) {
    fileTask.result.duration = fileEndTime - filePipelineStart;

    // Set file state: skip if all tests skipped, fail if any failures, otherwise pass
    if (allTestsSkipped) {
      fileTask.result.state = 'skip';
    } else {
      fileTask.result.state = hasFailures ? 'fail' : 'pass';
    }
  }

  debug(`[Pipeline] ${base} - Calling reportFileResults - file duration: ${fileTask.result?.duration?.toFixed(2)}ms | file state: ${fileTask.result?.state}`);
  
  const { workerPort, poolPort } = createWorkerChannel(project, false);
  
  try {
    const summaryTask: ReportFileResultsTask = {
      testFile: testFilePath,
      poolOptions,
      port: workerPort,
      fileTask,
      coverageData: pipelineCoverageByTestFile.get(testFilePath),
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
  timedOutResults: PoolTestExecutionContext[],
  project: TestProject,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(testFilePath);

  debug(`[Pipeline] ${base} - pipelineDispatchReportTestTimeouts reporting ${timedOutResults.length} timeouts`);

  const reportingStart = performance.now();
  const reportPromises = timedOutResults.map(async (r) => {
    const { workerPort, poolPort } = createWorkerChannel(project, false);
    
    try {
      const taskData: ReportTestFailureTask = {
        test: r.test,
        testFile: testFilePath,
        poolOptions,
        result: r.result,
        allResultErrors: r.allResultErrors,
        port: workerPort,
        testTaskId: r.testTask.id,
        testTaskName: r.testTask.name,
        testTaskMeta: r.testTask.meta,
        retryCount: r.retryCount,
        contextExecutionStart: r.executionStart
      };

      await pool.run(taskData, {
        name: 'reportTestFailure',
        transferList: [workerPort],
        signal: poolAbortSignal
      });
    } finally {
      workerPort.close();
      poolPort.close();
    }
  });

  await Promise.all(reportPromises);

  debug(`[Pipeline] ${base} - pipelineDispatchReportTestTimeouts completed`);
  debug(`[TIMING] ${base} - pipelineDispatchReportTestTimeouts: ${(performance.now() - reportingStart).toFixed(2)}ms`);
}


// ============================================================================
// Orchestration Functions
// ============================================================================

/**
 * Collect tests via per-file pipeline: compile → discover
 * Called for `vitest list` command
 *
 * @param specs - Test specifications from Vitest
 * @param config - Vitest resolved config
 * @param cache - Compilation cache instance
 * @param pool - Tinypool instance
 */
async function collectTests(
  specs: TestSpecification[],
  config: AssemblyScriptResolvedConfig,
  useWorkerCompilation: boolean,
  pool: Tinypool,
  poolAbortController: AbortController,
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const isCollectTestsMode = true;
  const { signal } = poolAbortController;
  
  debug('[Pool] -------- collectTests called for', specs.length, 'specs --------');

  debug('[Pool] Clearing compilation cache before collectTests run');
  pipelineCompileCacheByTestFile.clear();

  // Create pipeline for each file
  const filePipelines: Promise<void>[] = specs.map(async (spec: TestSpecification) => {
    const pipelineStart = Date.now();
    const testFilePath: string = spec.moduleId; // absolute path
    const base = basename(testFilePath);

    // set debug mode within this async context
    setDebugMode(poolOptions.debug);
    debug(`[Pipeline] ${base} - Starting pipeline at ${pipelineStart} for "${testFilePath}"`);

    try {
      const oldCompilation = pipelineCompileCacheByTestFile.get(testFilePath);
      if (oldCompilation) {
        debug(`[Pipeline] ${base} -   Deleting pipeline cache for existing spec (started at: ${oldCompilation.filePipelineStart}) before re-run`);
        pipelineCompileCacheByTestFile.delete(testFilePath);
      } else {
        debug(`[Pipeline] ${base} -   NO existing pipeline cache for spec`);
      }

      const compileResult = useWorkerCompilation
        ? await pipelineDispatchCompileFile(spec, config, pool, signal, isCollectTestsMode)
        : await pipelineQueueCompilation(testFilePath, config, signal, isCollectTestsMode);
      
      const newCompilation: CachedCompilation = {
        filePipelineStart: pipelineStart,
        testFilePath,
        ...compileResult,
        discoveredTests: {}
      };
      pipelineCompileCacheByTestFile.set(testFilePath, newCompilation);

      const discoverResults = await pipelineDispatchRunDiscovery(spec, newCompilation, config, pool, signal, isCollectTestsMode);
      newCompilation.discoverTiming = discoverResults.discoverTiming;
      newCompilation.discoveredTests = discoverResults.tests;
    } catch (error) {
      if (isAbortError(error)) {
        debug(`[Pipeline] ${base} - collectTests file pipeline aborted during run`);
        // swallow abort error, this pipeline is done
        return;
      }

      const poolError = createPoolErrorFromAnyError(`${base} - collectTests file pipeline failure`, POOL_ERROR_NAMES.PoolError, error);
      const testError = getTestErrorFromPoolError(poolError);
      
      try {
        debug(`[Pipeline] ${base} - collectTests file pipeline failure - Reporting test file failure:`, testError);

        // report a failure for this suite
        await pipelineDispatchReportFileFailure(testFilePath, spec.project, config, pool, signal, testError, isCollectTestsMode);
      } catch (reportErr) {
        const poolReportError = createPoolErrorFromAnyError(
          `${base} - collectTests file pipeline failure reporting failure`,
          POOL_ERROR_NAMES.PoolReportingError,
          reportErr
        );
        if (isAbortErrorString(poolReportError.name)) {
          debug(`[Pipeline] ${base} - collectTests file pipeline aborted during failure reporting`);
          // swallow abort error, this pipeline is done
          return;
        }

        throw reportErr;
      }

      // collectTests mode doesn't use normal console reporters, and only outputs errors when errors occur
      // so rethrow to stop the whole run when an error has encountered. this is different than runTests.
      throw poolError;
    } finally {
      debug(`[Pipeline] ${base} - Finished Pipeline Execution`);
    }
  });

  try {
    await Promise.all(filePipelines);
    debug('[Pipeline] collectTests - All file pipelines resolved');
  } catch (err) {
    debug('[Pipeline] collectTests - File pipeline REJECTED, Calling Pool Abort to bail this collectTests run');
    poolAbortController.abort();
  }
  
  debug('[Pool] -------- collectTests completed --------');
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
  useWorkerCompilation: boolean,
  pool: Tinypool,
  poolAbortController: AbortController,
  _invalidatedFiles?: string[]
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const isCollectTestsMode = false;

  debug('[Pool] -------- runTests called for', specs.length, 'specs --------');

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
  const filePipelines: Promise<void>[] = specs.map(async (spec: TestSpecification) => {
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
        debug(`[Pipeline] ${base} -   Deleting pipeline cache for existing spec (started at: `
          + `${oldCompilation.filePipelineStart} tests: ${Object.keys(oldCompilation.discoveredTests).length}) before re-run`
        );
        
        pipelineCompileCacheByTestFile.delete(testFilePath);
      } else {
        debug(`[Pipeline] ${base} -   NO existing pipeline cache for spec`);
      }

      // COMPILATION PHASE
      const p1Start = Date.now();
      
      const compileResult = useWorkerCompilation
        ? await pipelineDispatchCompileFile(spec, config, pool, signal, isCollectTestsMode)
        : await pipelineQueueCompilation(testFilePath, config, signal, isCollectTestsMode);

      const p1Ms = Date.now() - p1Start;
      debug(`[TIMING] ${base} - Pipeline Phase 1: ${p1Ms}ms`);

      const cached: CachedCompilation = {
        filePipelineStart,
        testFilePath,
        ...compileResult,
        discoveredTests: {}
      };
      pipelineCompileCacheByTestFile.set(testFilePath, cached);

      // DISCOVERY PHASE
      const p2Start = Date.now();
      const discoverResults = await pipelineDispatchRunDiscovery(spec, cached, config, pool, signal, isCollectTestsMode);
      const p2End = Date.now();
      const p2Ms = p2End - p2Start;
      debug(`[TIMING] ${base} - Pipeline Phase 2: ${p2Ms}ms`);
      debug(`[Pipeline] ${base} - Phase 2 complete, discovered ${Object.keys(cached.discoveredTests).length} tests`);

      cached.discoverTiming = discoverResults.discoverTiming;
      cached.discoveredTests = discoverResults.tests;

      // Extract test tasks from file task
      const testTasks = discoverResults.fileTask.tasks as RunnerTestCase[];

      const executionStart = Date.now();

      // Build text execution contexts for tasks configured to run
      const testContexts: PoolTestExecutionContext[] = [];
      testTasks.forEach(testTask => {
        const test = discoverResults.tests[testTask.id];
        if (!test) {
          throw createPoolError(
            `${base} - pipelineDispatchRunTests could not find discovered test by ID for task: ${testTask.id} (name: ${testTask.name})`,
            POOL_ERROR_NAMES.PoolError,
          );
        }

        test.isResolvedToRun = testTask.mode === 'run';

        if (test.isResolvedToRun) {
          const dummyResult: ExecuteTestResult = {
            name: testTask.name, passed: false, timedOut: false, assertionsPassed: 0, assertionsFailed: 0
          };
  
          const retryCount = test.options.retry > 0 ? 0 : undefined
          
          testContexts.push({ test, testFilePath, testTask, executeCount: 0, result: dummyResult, allResultErrors: [], retryCount, executionStart });
        }
      });

      discoverResults.fileTask.result = { state: 'run', startTime: filePipelineStart };
      
      let testContextsToExecute: PoolTestExecutionContext[] = testContexts;
      const finishedTestContexts: PoolTestExecutionContext[] = [];

      const p3Start = Date.now();
      let executeLoopCount: number = 0;
      
      // EXECUTION PHASE - LOOP UNTIL WE'RE DONE
      while (testContextsToExecute.length > 0) {
        const loopStart = performance.now();
        executeLoopCount++;
        debug(`[Pipeline] ${base} - Execution loop ${executeLoopCount} starting`);

        const testResults = await pipelineDispatchRunTests(cached, testContextsToExecute, config, spec.project, pool, signal);

        // find timed out tests as they won't have been reported already in either case:
        //   1) worker thread was aborted on timeout (hard)
        //   2) completed but should be marked timed out based on duration
        const timeouts = testResults.filter(context => {
          if (context.result.timedOut) {
            debug(`[Pipeline] ${base} - "${context.test.name}": Hard Timeout (abort): ${context.result.duration?.toFixed(2)}ms`);
            return true;
          } else if (!context.result.timedOut && ((context.result.duration || 0) > context.test.options.timeout)) {
            debug(`[Pipeline] ${base} - "${context.test.name}": Completed but Timed Out (setting failed): ${context.result.duration?.toFixed(2)}ms`);
            // these won't have been set as a failure by the executor in this edge case, so we do it here for proper reporting
            context.result.passed = false;
            context.result.timedOut = true;
            context.result.error = createTestTimeoutError(context.test)
            context.allResultErrors.push(context.result.error);
            return true;
          } else {
            return false;
          }
        });

        // report any test timeouts to vitest
        await pipelineDispatchReportTestTimeouts(testFilePath, timeouts, spec.project, config, pool, signal);

        // bucket finished tests vs failed tests which are configured to retry
        testContextsToExecute = [];
        testResults.forEach(context => {
          const totalExpectedExecutions = 1 + context.test.options.retry;
          const needsRetry = !context.result.passed && context.executeCount < totalExpectedExecutions;

          // sort out the contexts needing retries
          (needsRetry ? testContextsToExecute : finishedTestContexts).push(context);

          debug(`[Pipeline] ${base} - "${context.test.name}": ${needsRetry ? 'Submitting for retry' : 'Complete' } - ` 
            + ` passed ${context.result.passed} | ${context.executeCount} executions | ${context.executeCount - 1} retries`
            + ` | ${context.allResultErrors.length} errors`
          );
        });

        debug(`[Pipeline] ${base} - Execution loop ${executeLoopCount} end: ${(performance.now() - loopStart).toFixed(2)}ms`);

        if (testContextsToExecute.length > 0) {
          debug(`[Pipeline] ${base} - Re-executing ${testContextsToExecute.length} failed tests configured with retry settings`);
        } else {
          debug(`[Pipeline] ${base} - Execution Phase Complete - No Retries`);
        }
      }

      // Aggregate per-test result coverage into per-test-file coverage for file-level reporting
      if (config.coverage) {
        aggregateCoverageForTestFile(testFilePath, finishedTestContexts);
      }

      const p3Ms = Date.now() - p3Start;
      debug(`[TIMING] ${base} - Pipeline Execution Loops: ${p3Ms}ms`);

      // PHASE 5: Finalize and report
      const p5Start = Date.now();
      await pipelineDispatchReportFileResults(testFilePath, filePipelineStart, discoverResults.fileTask, finishedTestContexts, config, spec.project, pool, signal);
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
        debug(`[Pipeline] ${base} - runTests file pipeline aborted during run`);
        // swallow abort error, this pipeline is done
        return;
      }

      const poolError = createPoolErrorFromAnyError(`${base} - runTests file pipeline failure`, POOL_ERROR_NAMES.PoolError, error);
      const testError = getTestErrorFromPoolError(poolError);
      
      try {
        debug(`[Pipeline] ${base} - runTests file pipeline failure - Reporting test file failure:`, testError);

        // report a failure for this suite
        await pipelineDispatchReportFileFailure(testFilePath, spec.project, config, pool, signal, testError, isCollectTestsMode);
      } catch (reportErr) {
        const poolReportError = createPoolErrorFromAnyError(`${base} - runTests file pipeline failure reporting failure`,  POOL_ERROR_NAMES.PoolReportingError, reportErr);
        if (isAbortErrorString(poolReportError.name)) {
          debug(`[Pipeline] ${base} - runTests file pipeline aborted during failure reporting`);
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

  const results = await Promise.allSettled(filePipelines);
  const unexpectedErrors: any[] = [];
  results.forEach(r => {
    if (r.status === 'rejected') {
      unexpectedErrors.push(r.reason);
    }
  });

  if (unexpectedErrors.length === 0) {
    debug('[Pipeline] runTests - All file pipelines resolved');
  } else {
    debug('[Pipeline] runTests - Some file pipelines REJECTED unexpectedly. Throwing error(s) to vitest:', unexpectedErrors);
    throw {
      name: POOL_ERROR_NAMES.PoolError,
      message: 'Unexpected AssemblyScript Pool Error(s) Encountered during runTests',
      cause: unexpectedErrors
    };
  }

  debug('[Pool] -------- runTests completed --------');
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
      return collectTests(specs, resolvedConfig, useWorkerCompilation, pool, poolAbortController);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      const useWorkerCompilation = specs.length >= WORKER_COMPILE_FILES_PER_THREAD_THRESHOLD * maxThreads;
      return runTests(specs, resolvedConfig, useWorkerCompilation, pool, poolAbortController, invalidates);
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
