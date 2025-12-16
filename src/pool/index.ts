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
  PoolTestResult,
  InstrumentationOptions,
  ResolvedHybridProviderOptions,
  ReportFileFailureTask,
  AssemblyScriptCompilerOptions,
  CompileResult,
  CachedCompilation,
  AssemblyScriptTestError,
  AssemblyScriptResolvedConfig,
} from '../types/types.js';
import {
  ASSEMBLYSCRIPT_LIB_PREFIX,
  ASSEMBLYSCRIPT_POOL_NAME,
  POOL_ERROR_NAMES,
  POOL_INTERNAL_PATHS,
} from '../types/constants.js';
import { setDebugMode, debug } from '../util/debug.js';
import { compileAssemblyScript } from '../compiler/index.js';
import { createPhaseTimings } from '../util/timing.js';
import { createWorkerChannel } from './worker-channel.js';
import { getAssemblyScriptResolvedConfig } from './options.js';
import { mergeCoverageData } from '../coverage-provider/coverage-merge.js';
import { getTestErrorForPoolError, createPoolErrorFromError, throwPoolErrorIfAborted, isAbortErrorString, createPoolError } from '../util/pool-errors.js';

const WORKER_PATH = resolve(import.meta.dirname, 'pool-worker/index.js');

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
let compilationQueue = Promise.resolve({}) as Promise<CompileResult>;

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
  testResults: PoolTestResult[]
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
): Promise<CompileResult> {
  const base = basename(testFilePath);
  const currentCompilation = compilationQueue
    .catch(() => {
      debug(`[Pipeline] ${base} - queueCompilation rejection before queueing (ignoring previous error)`);
    })
    .then(async (): Promise<CompileResult> => {
      throwPoolErrorIfAborted(signal);

      const poolOptions = config.poolOptions.assemblyScript;

      // set debug mode within this async context
      setDebugMode(poolOptions.debug);

      const timings = createPhaseTimings();
      const isCoverageEnabled = config.coverage.enabled;

      // Only instrument when coverage is enabled and when not running a collectTests() operation
      const shouldInstrument = isCoverageEnabled && !isCollectTestsMode

      // TODO - move to options helpers (and rename options to config??)
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

      timings.phaseEnd = performance.now();
      debug(`[TIMING] ${base} - compileAssemblyScript total: ${(timings.phaseEnd - timings.phaseStart).toFixed(2)}ms`);

      return {
        binary: compileResult.binary,
        sourceMap: compileResult.sourceMap,
        isInstrumented: compileResult.isInstrumented,
        debugInfo: compileResult.debugInfo,
        compileTimings: timings,
      };
    })  
    .catch((err) => {
      throw createPoolErrorFromError(`${base} - queueCompilation`, POOL_ERROR_NAMES.CompilationError, err);
    });

  compilationQueue = currentCompilation;

  return currentCompilation;
}

/**
 * Phase 2: Discover tests in compiled binary
 * Always uses clean binary, populates cached.discoveredTests
 * Applies test name pattern filtering and returns file task with filtered tests
 * Throws on discovery failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param cachedContext - Cached compilation
 * @param spec - Test specification
 * @param pool - Tinypool instance
 * @param isCollectTestsMode - true when running a `collectTests()` operation only, false for full `runTests()`
 * @returns File task with filtered tests (undefined in collectTests mode)
 * @throws Error on discovery failure
 */
async function pipelineDispatchRunDiscovery(
  spec: TestSpecification,
  cachedContext: CachedCompilation,
  config: AssemblyScriptResolvedConfig,
  pool: Tinypool,
  signal: AbortSignal,
  isCollectTestsMode: boolean
): Promise<DiscoverTestsResult> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(cachedContext.testFilePath);

  debug(`[Pipeline] ${base} - Phase 2 (discover) starting`);

  const projectInfo = extractProjectInfo(spec);
  const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);
  
  try {
    const discoverTask: DiscoverTestsTask = {
      binary: cachedContext.binary,
      isBinaryInstrumented: cachedContext.isInstrumented,
      testFile: cachedContext.testFilePath,
      poolOptions,
      port: workerPort,
      projectInfo,
      compileTimings: cachedContext.compileTimings,
      debugInfo: cachedContext.debugInfo,
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
 * @param cachedContext - Cached compilation
 * @param testTasks - Array of test tasks to execute
 * @param project - Test project
 * @param config - Vitest resolved config
 * @param pool - Tinypool instance
 * @returns Array of test results with coverage data
 * @throws Error on test execution failure
 */
async function pipelineDispatchRunTests(
  cachedContext: CachedCompilation,
  testTasks: RunnerTestCase[],
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool,
  signal: AbortSignal
): Promise<PoolTestResult[]> {
  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  const base = basename(cachedContext.testFilePath);

  debug(`[Pipeline] ${base} - Phase 3 Execute starting - Coverage: ${config.coverage.enabled}`);
  const testFileSuiteStart = performance.now();

  const testExecutions = testTasks.map(async (testTask) => {
    // Match test task to discovered test by unique id
    const test = cachedContext.discoveredTests[testTask.id];
    if (!test) {
      throw createPoolErrorFromError(
        `${base} - pipelineDispatchRunTests`,
        POOL_ERROR_NAMES.WASMExecutionHarnessError,
        `Could not find discovered test for task: ${testTask.name}`,
      );
    }

    // Create RPC channel for this test
    const { workerPort: testWorkerPort, poolPort: testPoolPort } = createWorkerChannel(project, false);

    try {
      debug(`[Pipeline] ${base} - Executing test "${test.name}" with coverage enabled`);

      const executeTask: ExecuteTestTask = {
        collectCoverage: config.coverage.enabled,
        binary: cachedContext.binary,
        sourceMap: cachedContext.sourceMap,
        debugInfo: cachedContext.debugInfo,
        test,
        testFile: cachedContext.testFilePath,
        poolOptions,
        port: testWorkerPort,
        testTaskId: testTask.id,
        testTaskName: testTask.name,
        testTaskMeta: testTask.meta
      };

      const result: ExecuteTestResult = await pool.run(executeTask, {
        name: 'executeTest',
        transferList: [testWorkerPort],
        signal
      });

      return { testTask, result };
    } finally {
      testWorkerPort.close();
      testPoolPort.close();
    }
  });

  // Wait for all tests in this file to complete
  const testResults = await Promise.all(testExecutions);

  debug(`[Pipeline] ${base} - Phase 3 (execute) complete`);
  debug(`[TIMING] ${base} - test execution: ${(performance.now() - testFileSuiteStart).toFixed(2)}ms`);

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
 * @param testResults - Actual test results from Phase 3 or Phase 4 (not RPC side-effects)
 * @param project - Test project
 * @param config - Vitest resolved config
 * @param pool - Tinypool instance
 * @throws Error on summary reporting failure
 */
async function pipelineDispatchReportFileResults(
  testFilePath: string,
  fileTask: RunnerTestFile,
  testResults: PoolTestResult[],
  config: AssemblyScriptResolvedConfig,
  project: TestProject,
  pool: Tinypool
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
    fileTask.result.duration = fileEndTime - fileTask.result.startTime!;

    // Set file state: skip if all tests skipped, fail if any failures, otherwise pass
    if (allTestsSkipped) {
      fileTask.result.state = 'skip';
    } else {
      fileTask.result.state = hasFailures ? 'fail' : 'pass';
    }
  }

  // Report file summary (suite-finished + final flush)
  debug(`[Pipeline] ${base} - Calling reportFileResults - file duration: ${fileTask.result?.duration?.toFixed(2)}ms`);
  for (const tr of testResults) {
    debug(`[Pipeline] ${base} -   "${tr.testTask.name}": ${tr.result?.duration?.toFixed(2)}ms`);
  }

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
  poolAbortController: AbortController,
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
      // TODO pass through compileTimings
    };

    await pool.run(taskData, {
      name: 'reportPipelineFileFailure',
      transferList: [workerPort],
      signal: poolAbortController.signal
    });

    debug(`[Pipeline] ${base} - reportFileFailure completed`);
    debug(`[TIMING] ${base} - reportFileFailure: ${(performance.now() - reportingStart).toFixed(2)}ms`);

  } finally {
    workerPort.close();
    poolPort.close();
  }
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
    const pipelineStart = performance.now();
    const testFilePath: string = spec.moduleId; // absolute path
    const base = basename(testFilePath);

    // set debug mode within this async context
    setDebugMode(poolOptions.debug);
    debug(`[Pipeline] ${base} - Starting pipeline at ${pipelineStart} for "${testFilePath}"`);

    try {
      const oldCompilation = pipelineCompileCacheByTestFile.get(testFilePath);
      if (oldCompilation) {
        debug(`[Pipeline] ${base} -   Deleting pipeline cache for existing spec (started at: ${oldCompilation.pipelineStart}) before re-run`);
        pipelineCompileCacheByTestFile.delete(testFilePath);
      } else {
        debug(`[Pipeline] ${base} -   NO existing pipeline cache for spec`);
      }

      const compileResult = await pipelineQueueCompilation(testFilePath, config, signal, isCollectTestsMode);
      const newCompilation: CachedCompilation = {
        pipelineStart,
        testFilePath,
        ...compileResult,
        discoveredTests: {}
      };
      pipelineCompileCacheByTestFile.set(testFilePath, newCompilation);

      const discoverResults = await pipelineDispatchRunDiscovery(spec, newCompilation, config, pool, signal, isCollectTestsMode);
      newCompilation.discoverTimings = discoverResults.discoverTimings;
      newCompilation.discoveredTests = discoverResults.tests;
    } catch (error) {
      const poolError = createPoolErrorFromError(`${base} - collectTests file pipeline failure`, POOL_ERROR_NAMES.PoolError, error);
      const testError = getTestErrorForPoolError(poolError);

      if (isAbortErrorString(poolError.name)) {
        debug(`[Pipeline] ${base} - collectTests file pipeline aborted during run`);
        // swallow abort error, this pipeline is done
        return;
      }
      
      try {
        debug(`[Pipeline] ${base} - collectTests file pipeline failure - Reporting test file failure:`, testError);

        // report a failure for this suite
        await pipelineDispatchReportFileFailure(testFilePath, spec.project, config, pool, poolAbortController, testError, isCollectTestsMode);
      } catch (reportErr) {
        const poolReportError = createPoolErrorFromError(
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
    const pipelineStart = performance.now();
    const testFilePath: string = spec.moduleId; // absolute path
    const base = basename(testFilePath);
    const { signal } = poolAbortController;

    // set debug mode within this async context
    setDebugMode(poolOptions.debug);
    debug(`[Pipeline] ${base} - Starting pipeline at ${pipelineStart} for "${testFilePath}"`);

    try {
      const oldCompilation = pipelineCompileCacheByTestFile.get(testFilePath);
      if (oldCompilation) {
        debug(`[Pipeline] ${base} -   Deleting pipeline cache for existing spec (started at: `
          + `${oldCompilation.pipelineStart} tests: ${Object.keys(oldCompilation.discoveredTests).length}) before re-run`
        );
        
        pipelineCompileCacheByTestFile.delete(testFilePath);
      } else {
        debug(`[Pipeline] ${base} -   NO existing pipeline cache for spec`);
      }

      const p1Start = Date.now();
      const compileResult = await pipelineQueueCompilation(testFilePath, config, signal, isCollectTestsMode);
      const p1Ms = Date.now() - p1Start;
      debug(`[TIMING] ${base} - Pipeline Phase 1: ${p1Ms}ms`);

      const newCompilation: CachedCompilation = {
        pipelineStart,
        testFilePath,
        ...compileResult,
        discoveredTests: {}
      };
      pipelineCompileCacheByTestFile.set(testFilePath, newCompilation);

      // PHASE 2: Discover (with filtering applied in worker)
      const p2Start = Date.now();
      const discoverResults = await pipelineDispatchRunDiscovery(spec, newCompilation, config, pool, signal, isCollectTestsMode);
      const p2End = Date.now();
      const p2Ms = p2End - p2Start;
      debug(`[TIMING] ${base} - Pipeline Phase 2: ${p2Ms}ms`);
      debug(`[Pipeline] ${base} - Phase 2 complete, discovered ${Object.keys(newCompilation.discoveredTests).length} tests`);

      newCompilation.discoverTimings = discoverResults.discoverTimings;
      newCompilation.discoveredTests = discoverResults.tests;

      // Extract test tasks from file task
      const testTasks = discoverResults.fileTask.tasks as RunnerTestCase[];

      // Filter to only execute non-skipped tests
      const testTasksToExecute = testTasks.filter(t => t.mode !== 'skip');
      const skippedCount = testTasks.length - testTasksToExecute.length;

      if (skippedCount > 0) {
        debug(`[Pipeline] ${base} - Skipping ${skippedCount}/${testTasks.length} tests`);
      }

      // PHASE 3: Execute non-skipped tests
      const p3Start = Date.now();
      discoverResults.fileTask.result = { state: 'run', startTime: Date.now() };
      const testResults = await pipelineDispatchRunTests(newCompilation, testTasksToExecute, config, spec.project, pool, signal);
      const p3Ms = Date.now() - p3Start;
      debug(`[TIMING] ${base} - Pipeline Phase 3: ${p3Ms}ms`);

      // Aggregate per-test result coverage into per-test-file coverage for file-level reporting
      if (spec.project.config.coverage) {
        const covStart = Date.now();

        aggregateCoverageForTestFile(testFilePath, testResults);

        const covMs = Date.now() - covStart;
        debug(`[TIMING] ${base} - Pipeline Post-Phase 3 Coverage Aggregation: ${covMs}ms`);
      }

      // PHASE 5: Finalize and report
      const p5Start = Date.now();
      await pipelineDispatchReportFileResults(testFilePath, discoverResults.fileTask, testResults, config, spec.project, pool);
      const p5End = Date.now();
      const p5Ms = p5End - p5Start;

      debug(() => (
          `[TIMING] ${base} - Pipeline Phase 5: ${p5Ms}ms\n`
        + `[TIMING] ${base} - Pipeline Phase 1-2 (prep): ${p2End - p1Start}ms\n`
        + `[TIMING] ${base} - Pipeline Phase 3-5 (exec/report): ${p5End - p3Start}ms\n`
        + `[TIMING] ${base} - Pipeline Total: ${p5End - p1Start}ms`
      ));
    } catch (error) {
      const poolError = createPoolErrorFromError(`${base} - runTests file pipeline failure`, POOL_ERROR_NAMES.PoolError, error);
      const testError = getTestErrorForPoolError(poolError);

      if (isAbortErrorString(poolError.name)) {
        debug(`[Pipeline] ${base} - runTests file pipeline aborted during run`);
        // swallow abort error, this pipeline is done
        return;
      }
      
      try {
        debug(`[Pipeline] ${base} - runTests file pipeline failure - Reporting test file failure:`, testError);

        // report a failure for this suite
        await pipelineDispatchReportFileFailure(testFilePath, spec.project, config, pool, poolAbortController, testError, isCollectTestsMode);
      } catch (reportErr) {
        const poolReportError = createPoolErrorFromError(`${base} - runTests file pipeline failure reporting failure`,  POOL_ERROR_NAMES.PoolReportingError, reportErr);
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
    // Multi-project mode: find the first project using this pool
    const project = ctx.projects.find(p => p.config.pool.includes(ASSEMBLYSCRIPT_POOL_NAME));

    if (project) {
      projectConfig = project.config;
      multiProjectName = project.name;

      // it appears the individual project's ResolvedConfig doesn't
      // get the global coverage section, probably because we're not supposed to look at it
      // except in the coverage provider
      // TODO confirm this
      projectConfig.coverage = ctx.config.coverage;
    }
  }

  // Resolve pool options and initialize debug mode
  const resolvedConfig = getAssemblyScriptResolvedConfig(projectConfig)
  const poolOptions = resolvedConfig.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);

  debug('[Pool] Initializing AssemblyScript Pool');

  if (multiProjectName) {
    debug(`[Pool] Multi-project mode: Using \`poolOptions.assemblyScript\` from project: "${multiProjectName}"`);
  } else {
    debug('[Pool] Single-project mode: No project defines `poolOptions.assemblyScript`, using global config with AssemblyScript pool defaults');
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

  // Usually ctrl+c in terminal
  ctx.onCancel(reason => {
    console.log(`[Pool] vitest onCancel received, calling AbortController:`, reason);
    poolAbortController.abort();
  });

  return {
    name: ASSEMBLYSCRIPT_POOL_NAME,

    // runs when executing vitest list
    async collectTests(specs: TestSpecification[]) {
      return collectTests(specs, resolvedConfig, pool, poolAbortController);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      return runTests(specs, resolvedConfig, pool, poolAbortController, invalidates);
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
