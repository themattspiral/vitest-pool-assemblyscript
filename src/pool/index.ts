/**
 * AssemblyScript Pool for Vitest
 *
 * This pool implements pipeline parallelism so that each file flows through
 * its pipeline independently, maximizing CPU utilization and minimizing idle time,
 * while keeping each test execution confined to an isolated WASM instance.
 */

import type { ProcessPool, Vitest, TestProject, TestSpecification, RunnerTestCase, RunnerTestFile, ResolvedConfig } from 'vitest/node';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import os from 'node:os';
import Tinypool from 'tinypool';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';

import type {
  CachedCompilation,
  DiscoveredTest,
  DiscoverTestsTask,
  DiscoverTestsResult,
  ExecuteTestTask,
  ExecuteTestWithCoverageTask,
  ExecuteTestResult,
  ReportFileSummaryTask,
  CoverageData,
  ProjectInfo,
  PoolTestResult,
} from '../types.js';
import { ASSEMBLYSCRIPT_POOL_NAME } from '../types.js';
import { setDebugMode, debug } from '../utils/debug.mjs';
import { compileAssemblyScript } from '../compiler/index.js';
import { createPhaseTimings } from '../utils/timing.mjs';
import { createWorkerChannel } from './worker-channel.js';
import { getCoverageModeFlags, isCoverageEnabled, getPoolOptions } from './options.js';
import { createCompilationCache, type CompilationCache } from './cache.js';
import { mergeCoverageData } from '../coverage-provider/coverage-merge.js';

// ESM-compatible __dirname (import.meta.url is transformed by tsup/esbuild)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = resolve(__dirname, 'pool-worker/index.js');

// Error code for cache invalidation failures (stale generation)
const CACHE_INVALIDATED_ERROR_CODE = 'CACHE_INVALIDATED';

// Pipeline storage: holds aggregated coverage for each test file during execution
// Key: test file path (e.g., math.as.test.ts)
// Value: merged coverage from all tests in that file (organized by source file paths internally)
// Used to pass coverage data from phase 3 (test execution) to phase 5 (finalize/report)
// TODO: Can be eliminated when failsafe mode is removed (phase 4), allowing direct reporting at end of phase 3
const pipelineCoverageByTestFile = new Map<string, CoverageData>();

// Single sequential compilation queue for V8 warmup
let compilationQueue: Promise<CachedCompilation> = Promise.resolve() as unknown as Promise<CachedCompilation>;

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
 * Aggregate per-test coverage into per-file coverage for pipeline storage
 *
 * Takes coverage results from individual test executions (phase 3), merges them
 * by summing hit counts for each function, and stores the result in pipeline
 * storage for later reporting in phase 5.
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param testResults - Test results from phase 3 execution
 */
function aggregateTestCoverageForFile(
  testFilePath: string,
  testResults: PoolTestResult[]
): void {
  debug(`[Pipeline ${basename(testFilePath)}] Aggregating per-test coverage into per-file coverage`);

  // Extract coverage data from each individual test result
  const perTestCoverage = testResults
    .map(({ result }) => result.coverage)
    .filter((cov): cov is CoverageData => cov !== undefined);

  if (perTestCoverage.length > 0) {
    // Merge all per-test coverage by summing hit counts for each position
    const fileCoverage: CoverageData = {
      hitCountsByFileAndPosition: {},
    };

    // Use shared merge logic for each per-test coverage
    for (const testCoverage of perTestCoverage) {
      mergeCoverageData(fileCoverage, testCoverage);
    }

    // Store in pipeline storage for phase 5 reporting
    const sourceFileCount = Object.keys(fileCoverage.hitCountsByFileAndPosition).length;
    const positionCount = Object.values(fileCoverage.hitCountsByFileAndPosition)
      .reduce((sum, positions) => sum + Object.keys(positions).length, 0);
    debug(`[Pipeline ${basename(testFilePath)}] Aggregated coverage: ${sourceFileCount} source files, ${positionCount} positions`);

    pipelineCoverageByTestFile.set(testFilePath, fileCoverage);

    debug(`[Pipeline ${basename(testFilePath)}] Coverage aggregation complete`);
  }
}

/**
 * Queue compilation sequentially for V8 warmup
 *
 * Compiles once and returns both clean and instrumented binaries (when coverage enabled).
 * Sequential queueing maintains V8 JIT warmup benefits.
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param config - Vitest resolved config
 * @param rpcCollect - true when running a `collectTests()` operation only, false for full `runTests()`
 * @param generation - Cache generation number for validation
 * @returns Promise that resolves with cached compilation
 */
async function queueCompilation(
  testFilePath: string,
  config: ResolvedConfig,
  rpcCollect: boolean,
  generation: number
): Promise<CachedCompilation> {
  const currentCompilation = compilationQueue.then(async () => {
    // set debug mode within this async context
    const poolOptions = getPoolOptions(config);
    setDebugMode(poolOptions.debug);

    const timings = createPhaseTimings();

    // Single compilation returns both clean and instrumented binaries if needed.
    // Only instrument when coverage is enabled and when not running a collectTests() operation
    const compileResult = await compileAssemblyScript(testFilePath, {
      instrument: isCoverageEnabled(config) && !rpcCollect,
      stripInline: poolOptions.stripInline,
    });

    timings.phaseEnd = performance.now();
    debug(`[TIMING] ${basename(testFilePath)} - compileAssemblyScript total: ${timings.phaseEnd - timings.phaseStart}ms`);

    return {
      clean: compileResult.clean,
      instrumented: compileResult.instrumented,
      sourceMap: compileResult.sourceMap,
      debugInfo: compileResult.debugInfo,
      discoveredTests: [],
      compileTimings: timings,
      generation,
    };
  });

  compilationQueue = currentCompilation.catch((err) => {
    throw err;
  });

  return currentCompilation;
}

// ============================================================================
// Phase Functions
// ============================================================================

/**
 * Phase 1: Compile test file
 * Returns cached compilation or compiles if needed
 * Throws on compilation failure or cache validation failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param projectConfig - Vitest resolved config for this project
 * @param cache - Compilation cache instance
 * @param rpcCollect - true when running a `collectTests()` operation only, false for full `runTests()`
 * @returns Cached compilation
 * @throws Error on compilation failure or cache validation failure
 */
async function executePhase1Compilation(
  testFilePath: string,
  projectConfig: ResolvedConfig,
  cache: CompilationCache,
  rpcCollect: boolean
): Promise<CachedCompilation> {
  // set debug mode within this async context
  const poolOptions = getPoolOptions(projectConfig);
  setDebugMode(poolOptions.debug);

  debug(`[Pipeline ${basename(testFilePath)}] Phase 1 (compile) starting`);
  let cached = cache.get(testFilePath);

  if (!cached) {
    const currentGen = cache.getCurrentGeneration(testFilePath);
    const result = await queueCompilation(testFilePath, projectConfig, rpcCollect, currentGen);

    // Validate generation before caching
    if (!cache.validateAndCache(testFilePath, result)) {
      throw new Error(`${CACHE_INVALIDATED_ERROR_CODE}: ${testFilePath}`);
    }

    cached = result;
  }

  return cached;
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
async function executePhase2Discovery(
  testFilePath: string,
  cached: CachedCompilation,
  spec: TestSpecification,
  pool: Tinypool,
  isCollectTestsMode: boolean
): Promise<RunnerTestFile | undefined> {
  // set debug mode within this async context
  const poolOptions = getPoolOptions(spec.project.config);
  setDebugMode(poolOptions.debug);

  debug(`[Pipeline ${basename(testFilePath)}] Phase 2 (discover) starting`);

  // Call worker if:
  //   (1) First discovery (cache empty), OR
  //   (2) Need fresh fileTask with current filtering for runTests mode
  //
  // When shouldCallWorker is false:
  //   - We're in collectTests mode AND tests already cached
  //   - This edge case shouldn't happen (watch mode invalidates cache before re-collecting)
  //   - But if it does (e.g., `vitest list` called twice), returning undefined is correct
  //     since collectTests mode doesn't need fileTask
  const shouldCallWorker = cached.discoveredTests.length === 0 || !isCollectTestsMode;

  let fileTask: RunnerTestFile | undefined;

  if (shouldCallWorker) {
    const projectInfo = extractProjectInfo(spec);
    const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);

    try {
      const discoverTask: DiscoverTestsTask = {
        binary: cached.clean,
        testFile: testFilePath,
        poolOptions,
        port: workerPort,
        projectInfo,
        compileTimings: cached.compileTimings,
        debugInfo: cached.debugInfo,
        testNamePattern: spec.project.config.testNamePattern,
        allowOnly: spec.project.config.allowOnly,
      };

      const discoverResult = await pool.run(discoverTask, {
        name: 'discoverTests',
        transferList: [workerPort],
      }) as DiscoverTestsResult;

      // Update cache on first discovery only
      if (cached.discoveredTests.length === 0) {
        cached.discoveredTests = discoverResult.tests;
        cached.discoverTimings = discoverResult.timings;
      }

      // Return fileTask for runTests mode (with current filtering applied)
      if (!isCollectTestsMode) {
        fileTask = discoverResult.fileTask;
      }
    } finally {
      workerPort.close();
      poolPort.close();
    }
  }

  debug(`[Pipeline ${basename(testFilePath)}] Phase 2 (discover) complete, found ${cached.discoveredTests.length} tests`);
  return fileTask;
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
 * @param isFailsafeMode - Whether failsafe mode is enabled
 * @returns Array of test results with coverage data
 * @throws Error on test execution failure
 */
async function executePhase3Tests(
  testFilePath: string,
  cached: CachedCompilation,
  testTasks: RunnerTestCase[],
  project: TestProject,
  pool: Tinypool,
  isFailsafeMode: boolean
): Promise<PoolTestResult[]> {
  // set debug mode within this async context
  const poolOptions = getPoolOptions(project.config);
  const coverageEnabled = isCoverageEnabled(project.config);
  setDebugMode(poolOptions.debug);

  debug(`[Pipeline ${basename(testFilePath)}] Phase 3 Execute starting - coverage: ${coverageEnabled}`);

  const testExecutions = testTasks.map(async (testTask) => {
    // Match test task to discovered test by name
    const test = cached.discoveredTests.find(t => t.name === testTask.name);
    if (!test) {
      throw new Error(`Could not find discovered test for task: ${testTask.name}`);
    }

    // Create RPC channel for this test
    const { workerPort: testWorkerPort, poolPort: testPoolPort } = createWorkerChannel(project, false);

    try {
      if (coverageEnabled) {
        // Unlike JS/TS pools that selectively instrument files, we compile entire test files
        // (including imported source files) into single WASM binaries and must instrument everything.
        // Coverage filtering via include/exclude will be applied during Istanbul format conversion.
        debug(`[Pipeline ${basename(testFilePath)}] Executing test "${test.name}" with coverage on instrumented binary`);
        if (!cached.instrumented || !cached.debugInfo) {
          throw new Error(`Instrumented binary not available for ${testFilePath}`);
        }

        const executeTask: ExecuteTestWithCoverageTask = {
          binary: cached.instrumented,
          sourceMap: cached.sourceMap,
          debugInfo: cached.debugInfo,
          test,
          testFile: testFilePath,
          poolOptions,
          port: testWorkerPort,
          testTaskId: testTask.id,
          testTaskName: testTask.name,
          suppressFailureReporting: isFailsafeMode,  // Only true for failsafe mode
        };

        const result: ExecuteTestResult = await pool.run(executeTask, {
          name: 'executeTestWithCoverage',
          transferList: [testWorkerPort],
        }) as ExecuteTestResult;

        return { testTask, result: result.result };
      } else {
        // COVERAGE DISABLED: Execute on clean binary without coverage
        debug(`[Pipeline ${basename(testFilePath)}] Executing test "${test.name}" without coverage on clean binary`);
        const executeTask: ExecuteTestTask = {
          binary: cached.clean,
          sourceMap: cached.sourceMap,
          test,
          testFile: testFilePath,
          poolOptions,
          port: testWorkerPort,
          testTaskId: testTask.id,
          testTaskName: testTask.name,
        };

        const result: ExecuteTestResult = await pool.run(executeTask, {
          name: 'executeTest',
          transferList: [testWorkerPort],
        }) as ExecuteTestResult;

        return { testTask, result: result.result };
      }
    } finally {
      testWorkerPort.close();
      testPoolPort.close();
    }
  });

  // Wait for all tests in this file to complete
  const testResults = await Promise.all(testExecutions);

  debug(`[Pipeline ${basename(testFilePath)}] Phase 3 (execute) complete`);

  return testResults;
}

/**
 * Phase 4: Failsafe mode - Re-run failed tests on clean binary
 * Provides accurate error messages by re-running failures
 * Warns if tests pass on clean after failing on instrumented (instrumentation issue)
 * Returns updated test results with clean binary results for failed tests
 * Throws on re-run execution failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param cached - Cached compilation
 * @param testResults - Results from Phase 3 (instrumented binary)
 * @param project - Test project
 * @param pool - Tinypool instance
 * @returns Updated test results with clean binary results for failed tests
 * @throws Error on re-run execution failure
 */
async function executePhase4FailsafeRerun(
  testFilePath: string,
  cached: CachedCompilation,
  testResults: PoolTestResult[],
  project: TestProject,
  pool: Tinypool
): Promise<PoolTestResult[]> {
  // set debug mode within this async context
  const poolOptions = getPoolOptions(project.config);
  setDebugMode(poolOptions.debug);

  debug(`[Pipeline ${basename(testFilePath)}] Phase 4 (failsafe rerun): checking for failures`);

  // Check for failures in Phase 3 results
  const failedResults = testResults.filter(({ result }) => !result.passed);

  if (failedResults.length > 0) {
    // Failures detected - re-run failed tests on clean binary for accurate error messages
    debug(`[Pipeline ${basename(testFilePath)}] Phase 4 (failsafe rerun): ${failedResults.length} failures detected, re-running on clean binary`);

    // Re-run only failed tests on clean binary and collect their results
    const rerunExecutions = failedResults.map(async ({ testTask, result: _originalResult }) => {
      // Match test task to discovered test by name
      const test = cached.discoveredTests.find(t => t.name === testTask.name);
      if (!test) {
        throw new Error(`Could not find discovered test for rerun: ${testTask.name}`);
      }

      const { workerPort: rerunPort, poolPort: rerunPoolPort } = createWorkerChannel(project, false);

      const rerunTask: ExecuteTestTask = {
        binary: cached.clean,
        sourceMap: cached.sourceMap,
        test,
        testFile: testFilePath,
        poolOptions,
        port: rerunPort,
        testTaskId: testTask.id,
        testTaskName: testTask.name,
        suppressPrepareReporting: true,  // test-prepare already reported in Phase 3
      };

      try {
        const cleanResult = await pool.run(rerunTask, {
          name: 'executeTest',
          transferList: [rerunPort],
        }) as ExecuteTestResult;

        return { testTask, result: cleanResult.result };
      } finally {
        rerunPort.close();
        rerunPoolPort.close();
      }
    });

    // Wait for all re-runs to complete and collect results
    const cleanBinaryResults = await Promise.all(rerunExecutions);

    debug(`[Pipeline ${basename(testFilePath)}] Phase 4 (failsafe rerun): complete, re-ran ${cleanBinaryResults.length} previously failed tests to capture errors`);

    // Check if any tests passed on clean after failing on instrumented
    // This indicates potential instrumentation issues
    for (const { testTask, result } of cleanBinaryResults) {
      if (result.passed) {
        // Test failed on instrumented but passed on clean - warn user
        console.warn(
          `⚠️ Warning: Test '${testTask.name}' failed on instrumented binary but passed on clean binary.\n` +
          `  This may indicate an issue with coverage instrumentation affecting test behavior.\n` +
          `  File: ${testFilePath}`
        );
      }
    }

    // Build map of clean binary results by testTask for efficient lookup
    const cleanResultsByTask = new Map(
      cleanBinaryResults.map(({ testTask, result }) => [testTask, result])
    );

    // Return updated results: use clean binary results for failed tests, keep Phase 3 results for passed tests
    return testResults.map((originalResult) => {
      const cleanResult = cleanResultsByTask.get(originalResult.testTask);
      return cleanResult ? { testTask: originalResult.testTask, result: cleanResult } : originalResult;
    });
  } else {
    debug(`[Pipeline ${basename(testFilePath)}] Phase 4 (failsafe rerun): no failures, skipping clean binary re-run`);
    return testResults;
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
 * @param testResults - Actual test results from Phase 3 or Phase 4 (not RPC side-effects)
 * @param project - Test project
 * @param config - Vitest resolved config
 * @param pool - Tinypool instance
 * @throws Error on summary reporting failure
 */
async function executePhase5FinalizeFileResults(
  testFilePath: string,
  fileTask: RunnerTestFile,
  testResults: PoolTestResult[],
  project: TestProject,
  pool: Tinypool
): Promise<void> {
  // set debug mode within this async context
  const poolOptions = getPoolOptions(project.config);
  setDebugMode(poolOptions.debug);

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
  debug(`[Pipeline ${basename(testFilePath)}] Calling reportFileSummary - file duration: ${fileTask.result?.duration}ms`);
  for (const tr of testResults) {
    debug(`[Pipeline ${basename(testFilePath)}]     ${tr.testTask.name}: ${tr.result.duration}ms`);
  }

  const { workerPort: summaryPort, poolPort: summaryPoolPort } = createWorkerChannel(project, false);

  try {
    const summaryTask: ReportFileSummaryTask = {
      testFile: testFilePath,
      poolOptions,
      port: summaryPort,
      fileTask,
      coverageData: pipelineCoverageByTestFile.get(testFilePath),
    };

    await pool.run(summaryTask, {
      name: 'reportFileSummary',
      transferList: [summaryPort],
    });
    debug(`[Pipeline ${basename(testFilePath)}] reportFileSummary completed`);
  } finally {
    summaryPort.close();
    summaryPoolPort.close();
  }
}

// ============================================================================
// Orchestration Functions
// ============================================================================

/**
 * Collect tests via per-file pipeline: compile → discover
 * Called for `vitest list` command and in watch mode
 *
 * @param specs - Test specifications from Vitest
 * @param config - Vitest resolved config
 * @param cache - Compilation cache instance
 * @param pool - Tinypool instance
 */
async function collectTests(
  specs: TestSpecification[],
  config: ResolvedConfig,
  cache: CompilationCache,
  pool: Tinypool
): Promise<void> {
  // set debug mode within this async context
  const poolOptions = getPoolOptions(config);
  setDebugMode(poolOptions.debug);

  debug('[Pool] collectTests called for', specs.length, 'specs');

  // Create pipeline for each file
  const filePipelines: Promise<{
    spec: TestSpecification,
    tests: DiscoveredTest[]
  }>[] = specs.map(async (spec: TestSpecification) => {
    const testFilePath: string = spec.moduleId; // absolute path

    try {
      // PHASE 1: Compile
      const cached = await executePhase1Compilation(testFilePath, spec.project.config, cache, true);

      // PHASE 2: Discover
      await executePhase2Discovery(testFilePath, cached, spec, pool, true);

      return { spec, tests: cached.discoveredTests };

    } catch (error) {
      // Check if cache validation failure (acceptable, return empty list)
      if (error instanceof Error && error.message.startsWith(`${CACHE_INVALIDATED_ERROR_CODE}`)) {
        debug(`[Pipeline ${basename(testFilePath)}] ${error.message}`);
        return { spec, tests: [] };
      }

      // Compilation or discovery failures: log and return empty list
      debug(`[Pool] Pipeline failed for ${testFilePath}:`, error);
      return { spec, tests: [] };
    }
  });

  // Wait for all file pipelines to complete
  await Promise.all(filePipelines);

  debug('[Pool] collectTests completed');
}

/**
 * Run tests using true pipeline parallelism
 * Each file flows through its pipeline independently: compile → discover → execute tests
 * Pool handles suite-level RPC events, workers handle test-level events
 *
 * @param specs - Test specifications from Vitest
 * @param config - Vitest resolved config
 * @param cache - Compilation cache instance
 * @param pool - Tinypool instance
 * @param invalidates - Optional list of invalidated file paths
 */
async function runTests(
  specs: TestSpecification[],
  config: ResolvedConfig,
  cache: CompilationCache,
  pool: Tinypool,
  invalidates?: string[]
): Promise<void> {
  // set debug mode within this async context
  const opts = getPoolOptions(config);
  setDebugMode(opts.debug);

  debug('[Pool] runTests called for', specs.length, 'specs');
  debug('[Pool] Invalidated files:', invalidates?.length ?? 0);

  // Clear cache for invalidated files and bump generations
  if (invalidates) {
    cache.invalidate(invalidates);
  }

  // Create pipeline for each file
  const filePipelines: Promise<void>[] = specs.map(async (spec: TestSpecification) => {
    const testFilePath: string = spec.moduleId; // absolute path
    const poolOptions = getPoolOptions(spec.project.config);

    // set debug mode within this async context
    setDebugMode(poolOptions.debug);
    debug(`[Pipeline ${basename(testFilePath)}] Starting pipeline for ${testFilePath}`);

    try {
      // PHASE 1: Compile (happens in in main thread, not worker, but doesn't block)
      const p1Start = Date.now();
      const cached = await executePhase1Compilation(testFilePath, config, cache, false);
      const p1Ms = Date.now() - p1Start;
      debug(`[Pipeline ${basename(testFilePath)}] Phase 1 Pipeline Timing: ${p1Ms}ms`);

      // PHASE 2: Discover (with filtering applied in worker)
      const p2Start = Date.now();
      const fileTask = await executePhase2Discovery(testFilePath, cached, spec, pool, false);
      const p2End = Date.now();
      const p2Ms = p2End - p2Start;
      debug(`[Pipeline ${basename(testFilePath)}] Phase 2 Pipeline Timing: ${p2Ms}ms`);

      if (!fileTask) {
        throw new Error(`Phase 2 discovery did not return file task for ${testFilePath}`);
      }

      debug(`[Pipeline ${basename(testFilePath)}] Phase 2 complete, found ${cached.discoveredTests.length} tests`);

      // Get coverage mode
      const { isFailsafeMode } = getCoverageModeFlags(config);

      // Extract test tasks from file task
      const testTasks: RunnerTestCase[] = fileTask.tasks as RunnerTestCase[];

      // Filter to only execute non-skipped tests
      const testsToExecute = testTasks.filter(t => t.mode !== 'skip');
      const skippedCount = testTasks.length - testsToExecute.length;

      if (skippedCount > 0) {
        debug(`[Pipeline ${basename(testFilePath)}] Skipping ${skippedCount}/${testTasks.length} tests due to testNamePattern filter`);
      }

      // PHASE 3: Execute non-skipped tests
      const p3Start = Date.now();
      fileTask.result = { state: 'run', startTime: Date.now() };
      const testResults = await executePhase3Tests(
        testFilePath,
        cached,
        testsToExecute,
        spec.project,
        pool,
        isFailsafeMode
      );
      const p3Ms = Date.now() - p3Start;
      debug(`[Pipeline ${basename(testFilePath)}] Phase 3 Pipeline Timing: ${p3Ms}ms`);

      // Aggregate per-test coverage into per-file coverage for phase 5 reporting
      if (isCoverageEnabled(config)) {
        const covStart = Date.now();

        aggregateTestCoverageForFile(testFilePath, testResults);

        const covMs = Date.now() - covStart;
        debug(`[Pipeline ${basename(testFilePath)}] Post Phase 3 - Coverage Aggregation PipeLine Timing: ${covMs}ms`);
      }

      // PHASE 4: Failsafe reruns - returns updated results with clean binary results for failures
      let finalTestResults = testResults;
      if (isFailsafeMode) {
        const p4Start = Date.now();
        finalTestResults = await executePhase4FailsafeRerun(testFilePath, cached, testResults, spec.project, pool);
        const p4Ms = Date.now() - p4Start;
        debug(`[Pipeline ${basename(testFilePath)}] Phase 4 Pipeline Timing: ${p4Ms}ms`);
      }

      // PHASE 5: Finalize and report - use final test results (Phase 4 in failsafe, Phase 3 in integrated)
      const p5Start = Date.now();
      await executePhase5FinalizeFileResults(testFilePath, fileTask, finalTestResults, spec.project, pool);
      const p5End = Date.now();
      const p5Ms = p5End - p5Start;
      debug(`[Pipeline ${basename(testFilePath)}] Phase 5 Pipeline Timing: ${p5Ms}ms`);

      debug(`[Pipeline ${basename(testFilePath)}] Phase 1-2 Pipeline Timing: ${p2End - p1Start}ms`);
      debug(`[Pipeline ${basename(testFilePath)}] Phase 3-5 Pipeline Timing: ${p5End - p3Start}ms`);
      debug(`[Pipeline ${basename(testFilePath)}] Total Pipeline Timing: ${p5End - p1Start}ms`);
      
      debug(`[Pipeline ${basename(testFilePath)}] Finished Pipeline for ${testFilePath}`);

    } catch (error) {
      // Check if cache validation failure (acceptable, silent)
      if (error instanceof Error && error.message.startsWith(`${CACHE_INVALIDATED_ERROR_CODE}`)) {
        debug(`[Pipeline ${basename(testFilePath)}] ${error.message}`);
        return;
      }

      // All other errors: log to console and exit pipeline
      console.error(`[Pool] Error in pipeline for ${testFilePath}:`, error);
      return;
    }
  });

  // Wait for all file pipelines to complete
  await Promise.all(filePipelines);

  debug('[Pool] runTests completed');
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
    throw new Error(`Worker file not found at ${WORKER_PATH}`);
  }

  // In multi-project mode, ctx.config is the global config, not the project-specific config
  // We need to find our project in ctx.projects to get project-specific poolOptions
  let projectConfig = ctx.config;
  let multiProjectName;

  if (ctx.projects && ctx.projects.length > 0) {
    // Multi-project mode: find the first project using this pool
    const project = ctx.projects.find(p => {
      return typeof p.config.pool === 'string' && !!p.config.poolOptions?.assemblyScript;
    });

    if (project) {
      projectConfig = project.config;
      multiProjectName = project.name;
    }
  }

  // Read pool options and initialize debug mode
  const poolOptions = getPoolOptions(projectConfig);
  setDebugMode(poolOptions.debug);

  debug('[Pool] Initializing AssemblyScript pool');

  if (multiProjectName) {
    debug('[Pool] Multi-project mode: Using `poolOptions.assemblyScript` from project', multiProjectName);
  } else {
    debug('[Pool] Single-project mode: No project defines `poolOptions.assemblyScript`, using global config with AssemblyScript pool defaults');
  }

  const compilationCache = createCompilationCache();

  const cpus = os.availableParallelism?.() ?? os.cpus().length;
  const maxThreads = poolOptions.maxThreads ?? Math.max(cpus - 1, 1);

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

  return {
    name: ASSEMBLYSCRIPT_POOL_NAME,

    // runs when executing vitest list
    async collectTests(specs: TestSpecification[]) {
      return collectTests(specs, projectConfig, compilationCache, pool);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      return runTests(specs, projectConfig, compilationCache, pool, invalidates);
    },

    // Cleanup when shutting down
    async close() {
      
      debug('[Pool] Tinypool destroyed');
      await pool.destroy();
      
      debug('[Pool] Clearing cache');
      compilationCache.clear();
      pipelineCoverageByTestFile.clear();

      debug('[Pool] Exiting');
    },
  };
}
