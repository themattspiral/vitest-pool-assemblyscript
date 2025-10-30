import type { ProcessPool, Vitest, TestProject, TestSpecification, RunnerTestCase, RunnerTestFile } from 'vitest/node';
import type { TestContext } from '@vitest/runner';
import { createFileTask } from '@vitest/runner/utils';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import os from 'node:os';
import Tinypool from 'tinypool';

import type {
  PoolOptions,
  CachedCompilation,
  DiscoverTestsTask,
  DiscoverTestsResult,
  ExecuteTestTask,
  ExecuteTestWithCoverageTask,
  ExecuteTestResult,
  ReportFileSummaryTask,
  FileCoverageData,
  AggregatedCoverage,
  CoverageData,
  ProjectInfo,
  PoolTestResult,
  DebugInfo,
} from '../types.js';
import { POOL_NAME } from '../types.js';
import { setDebug, debug, debugTiming } from '../utils/debug.mjs';
import { writeCoverageReport } from '../coverage/lcov-reporter.js';
import { compileAssemblyScript } from '../compiler.js';
import { createPhaseTimings } from '../utils/timing.mjs';
import { createWorkerChannel } from './worker-channel.js';
import { getCoverageModeFlags, isCoverageEnabled } from './options.js';
import { createCompilationCache, type CompilationCache } from './cache.js';

// ESM-compatible __dirname (import.meta.url is transformed by tsup/esbuild)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * AssemblyScript Pool for Vitest - True Pipeline Parallelism Architecture
 *
 * This pool implements true pipeline parallelism where each file flows through
 * its pipeline independently, maximizing CPU utilization and minimizing idle time.
 *
 * Architecture:
 *   File 1: compile → discover → [test1, test2, test3] → coverage
 *   File 2: compile → discover → [test4, test5]       → coverage
 *   File 3: compile → discover → [test6, test7, test8] → coverage
 *   All happening concurrently with maximum overlap
 *
 * Key Principle: Start next phase ASAP
 *   - Discovery: Starts as soon as that file's compilation completes
 *   - Test Execution: Starts as soon as that file's discovery completes
 *   - Coverage: Starts as soon as test execution and binary compilation complete
 *
 * Benefits:
 *   - True parallelism: Fast-compiling files start discovery before slow files finish
 *   - Pipeline efficiency: Phases overlap across files, workers stay busy
 *   - Better CPU utilization: Can mix fast/slow work
 *   - No artificial batching: Each file progresses independently
 *   - Maximum throughput: All workers utilized throughout execution
 */

// Error code for cache invalidation failures (stale generation)
const CACHE_INVALIDATED_ERROR_CODE = 'CACHE_INVALIDATED';

// Accumulate coverage data across all test files for single LCOV report
const coverageMap = new Map<string, FileCoverageData>();

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
 * Accumulate coverage data from test results and store in coverage map
 *
 * Extracts coverage from test results, aggregates them by summing hit counts,
 * and stores the result in the global coverage map.
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param testResults - Test results from Phase 3
 * @param debugInfo - DebugInfo from the instrumented binary used to collect coverage
 */
function accumulateCoverage(
  testFilePath: string,
  testResults: PoolTestResult[],
  debugInfo: DebugInfo
): void {
  debug(`[Pipeline ${testFilePath}] Accumulating coverage from test results`);

  const allCoverage = testResults
    .map(({ result }) => result.coverage)
    .filter((cov): cov is CoverageData => cov !== undefined);

  if (allCoverage.length > 0) {
    // Aggregate coverage by summing hit counts across all tests
    const aggregatedCoverage = allCoverage.reduce((acc, cov) => {
      // Merge function coverage
      for (const funcIdx in cov.functions) {
        acc.functions[funcIdx] = (acc.functions[funcIdx] ?? 0) + cov.functions[funcIdx]!;
      }
      // Merge block coverage
      for (const blockKey in cov.blocks) {
        acc.blocks[blockKey] = (acc.blocks[blockKey] ?? 0) + cov.blocks[blockKey]!;
      }
      return acc;
    }, { functions: {}, blocks: {} } as AggregatedCoverage);

    coverageMap.set(testFilePath, {
      coverage: aggregatedCoverage,
      debugInfo,
    });

    debug(`[Pipeline ${testFilePath}] Coverage accumulation complete`);
  }
}

/**
 * Queue compilation sequentially for V8 warmup
 *
 * Compiles once and returns both clean and instrumented binaries (when coverage enabled).
 * Sequential queueing maintains V8 JIT warmup benefits.
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param options - Pool options
 * @param generation - Cache generation number for validation
 * @returns Promise that resolves with cached compilation
 */
async function queueCompilation(testFilePath: string, options: PoolOptions, generation: number): Promise<CachedCompilation> {
  const currentCompilation = compilationQueue.then(async () => {
    const timings = createPhaseTimings();

    // Single compilation returns both clean and instrumented binaries
    const compileResult = await compileAssemblyScript(testFilePath, {
      coverage: isCoverageEnabled(options),
      stripInline: options.stripInline ?? true,
    });

    timings.phaseEnd = performance.now();
    debugTiming(`[TIMING] ${testFilePath} - compile: ${timings.phaseEnd - timings.phaseStart}ms`);

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
 * @param options - Pool options
 * @param cache - Compilation cache instance
 * @returns Cached compilation
 * @throws Error on compilation failure or cache validation failure
 */
async function executePhase1Compilation(
  testFilePath: string,
  options: PoolOptions,
  cache: CompilationCache
): Promise<CachedCompilation> {
  debug(`[Pipeline ${testFilePath}] Phase 1 (compile) starting`);
  let cached = cache.get(testFilePath);

  if (!cached) {
    const currentGen = cache.getCurrentGeneration(testFilePath);
    const result = await queueCompilation(testFilePath, options, currentGen);

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
 * Throws on discovery failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param cached - Cached compilation
 * @param spec - Test specification
 * @param project - Test project
 * @param options - Pool options
 * @param pool - Tinypool instance
 * @throws Error on discovery failure
 */
async function executePhase2Discovery(
  testFilePath: string,
  cached: CachedCompilation,
  spec: TestSpecification,
  project: TestProject,
  options: PoolOptions,
  pool: Tinypool
): Promise<void> {
  debug(`[Pipeline ${testFilePath}] Phase 2 (discover) starting`);

  if (cached.discoveredTests.length === 0) {
    const projectInfo = extractProjectInfo(spec);
    const { workerPort, poolPort } = createWorkerChannel(project, false);

    try {
      const discoverTask: DiscoverTestsTask = {
        binary: cached.clean,
        testFile: testFilePath,
        options,
        port: workerPort,
        projectInfo,
        compileTimings: cached.compileTimings,
        debugInfo: cached.debugInfo,
      };

      const discoverResult = await pool.run(discoverTask, {
        name: 'discoverTests',
        transferList: [workerPort],
      }) as DiscoverTestsResult;

      cached.discoveredTests = discoverResult.tests;
      cached.discoverTimings = discoverResult.timings;
    } finally {
      workerPort.close();
      poolPort.close();
    }
  }

  debug(`[Pipeline ${testFilePath}] Phase 2 (discover) complete, found ${cached.discoveredTests.length} tests`);
}

/**
 * Phase 3: Execute all tests for this file
 * Mode-dependent: Uses instrumented binary for integrated/failsafe modes
 * Returns test results for coverage accumulation
 * Throws on test execution failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param cached - Cached compilation
 * @param testTasks - Array of test tasks to execute
 * @param project - Test project
 * @param options - Pool options
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
  options: PoolOptions,
  pool: Tinypool,
  isFailsafeMode: boolean
): Promise<PoolTestResult[]> {
  debug(`[Pipeline ${testFilePath}] Phase 3 (execute) starting`);

  const testExecutions = testTasks.map(async (testTask, testIndex) => {
    const test = cached.discoveredTests[testIndex]!;

    // Create RPC channel for this test
    const { workerPort: testWorkerPort, poolPort: testPoolPort } = createWorkerChannel(project, false);

    try {
      // INTEGRATED/FAILSAFE MODE: Execute on instrumented binary with coverage
      if (!cached.instrumented || !cached.debugInfo) {
        throw new Error(`Instrumented binary not available for ${testFilePath}`);
      }

      const executeTask: ExecuteTestWithCoverageTask = {
        binary: cached.instrumented,
        sourceMap: cached.sourceMap,
        debugInfo: cached.debugInfo,
        test,
        testIndex,
        testFile: testFilePath,
        options,
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
    } finally {
      testWorkerPort.close();
      testPoolPort.close();
    }
  });

  // Wait for all tests in this file to complete
  const testResults = await Promise.all(testExecutions);

  debug(`[Pipeline ${testFilePath}] Phase 3 (execute) complete`);

  return testResults;
}

/**
 * Phase 4: Failsafe mode - Re-run failed tests on clean binary
 * Provides accurate error messages by re-running failures
 * Warns if tests pass on clean after failing on instrumented (instrumentation issue)
 * Throws on re-run execution failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param cached - Cached compilation
 * @param testResults - Results from Phase 3 (instrumented binary)
 * @param testTasks - Array of test tasks
 * @param project - Test project
 * @param options - Pool options
 * @param pool - Tinypool instance
 * @throws Error on re-run execution failure
 */
async function executePhase4FailsafeRerun(
  testFilePath: string,
  cached: CachedCompilation,
  testResults: PoolTestResult[],
  testTasks: RunnerTestCase[],
  project: TestProject,
  options: PoolOptions,
  pool: Tinypool
): Promise<void> {
  debug(`[Pipeline ${testFilePath}] Phase 4 (failsafe rerun): checking for failures`);

  // Check for failures in Phase 3 results
  const failedResults = testResults.filter(({ result }) => !result.passed);

  if (failedResults.length > 0) {
    // Failures detected - re-run failed tests on clean binary for accurate error messages
    debug(`[Pipeline ${testFilePath}] Phase 4 (failsafe rerun): ${failedResults.length} failures detected, re-running on clean binary`);

    // Re-run only failed tests on clean binary for accurate error messages
    const rerunExecutions = failedResults.map(async ({ testTask, result: _originalResult }) => {
      const testIndex = testTasks.indexOf(testTask);
      const test = cached.discoveredTests[testIndex]!;

      const { workerPort: rerunPort, poolPort: rerunPoolPort } = createWorkerChannel(project, false);

      const rerunTask: ExecuteTestTask = {
        binary: cached.clean,
        sourceMap: cached.sourceMap,
        test,
        testIndex,
        testFile: testFilePath,
        options,
        port: rerunPort,
        testTaskId: testTask.id,
        testTaskName: testTask.name,
      };

      try {
        await pool.run(rerunTask, {
          name: 'executeTest',
          transferList: [rerunPort],
        });
        // Worker reported results via RPC during execution
      } finally {
        rerunPort.close();
        rerunPoolPort.close();
      }
    });

    // Wait for all re-runs to complete
    // Workers reported results via RPC during execution
    await Promise.all(rerunExecutions);

    debug(`[Pipeline ${testFilePath}] Phase 4 (failsafe rerun): complete, results reported for all previously failing tests`);

    // Check if any tests passed on clean after failing on instrumented
    // This indicates potential instrumentation issues
    for (const { testTask } of failedResults) {
      if (testTask.result?.state === 'pass') {
        // Test failed on instrumented but passed on clean - warn user
        console.warn(
          `⚠️ Warning: Test '${testTask.name}' failed on instrumented binary but passed on clean binary.\n` +
          `  This may indicate an issue with coverage instrumentation affecting test behavior.\n` +
          `  File: ${testFilePath}`
        );
      }
    }
  } else {
    debug(`[Pipeline ${testFilePath}] Phase 4 (failsafe rerun): no failures, skipping clean binary re-run`);
  }
}

/**
 * Phase 5: Finalize file results and report summary
 * 
 * Updates file task state and calls reportFileSummary workler function.
 * Throws on summary reporting failure
 *
 * @param testFilePath - Path to test file (absolute path)
 * @param fileTask - File task from Vitest
 * @param project - Test project
 * @param options - Pool options
 * @param pool - Tinypool instance
 * @throws Error on summary reporting failure
 */
async function executePhase5finalizeFileResults(
  testFilePath: string,
  fileTask: RunnerTestFile,
  project: TestProject,
  options: PoolOptions,
  pool: Tinypool
): Promise<void> {
  // Update file task with final results
  const fileEndTime = Date.now();
  const hasFailures = fileTask.tasks.some((t) => t.result?.state === 'fail');

  if (fileTask.result) {
    fileTask.result.duration = fileEndTime - fileTask.result.startTime!;
    fileTask.result.state = hasFailures ? 'fail' : 'pass';
  }

  // Report file summary (suite-finished + final flush)
  debug(`[Pipeline ${testFilePath}] Calling reportFileSummary`);
  const { workerPort: summaryPort, poolPort: summaryPoolPort } = createWorkerChannel(project, false);

  try {
    const summaryTask: ReportFileSummaryTask = {
      testFile: testFilePath,
      options,
      port: summaryPort,
      fileTask,
    };

    await pool.run(summaryTask, {
      name: 'reportFileSummary',
      transferList: [summaryPort],
    });
    debug(`[Pipeline ${testFilePath}] reportFileSummary completed`);
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
 * @param options - Pool options
 * @param cache - Compilation cache instance
 * @param pool - Tinypool instance
 */
async function collectTests(
  specs: TestSpecification[],
  options: PoolOptions,
  cache: CompilationCache,
  pool: Tinypool
): Promise<void> {
  debug('[Pool] collectTests called for', specs.length, 'specs');

  // Create pipeline for each file
  const filePipelines = specs.map(async (spec: TestSpecification) => {
    const testFilePath: string = spec.moduleId; // absolute path
    const project: TestProject = spec.project;

    try {
      // PHASE 1: Compile
      const cached = await executePhase1Compilation(testFilePath, options, cache);

      // PHASE 2: Discover
      await executePhase2Discovery(testFilePath, cached, spec, project, options, pool);

      return { spec, tests: cached.discoveredTests };

    } catch (error) {
      // Check if cache validation failure (acceptable, return empty list)
      if (error instanceof Error && error.message.startsWith(`${CACHE_INVALIDATED_ERROR_CODE}`)) {
        debug(`[Pipeline ${testFilePath}] ${error.message}`);
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
 * @param options - Pool options
 * @param cache - Compilation cache instance
 * @param pool - Tinypool instance
 * @param invalidates - Optional list of invalidated file paths
 */
async function runTests(
  specs: TestSpecification[],
  options: PoolOptions,
  cache: CompilationCache,
  pool: Tinypool,
  invalidates?: string[]
): Promise<void> {
  debug('[Pool] runTests called for', specs.length, 'specs');
  debug('[Pool] Invalidated files:', invalidates?.length ?? 0);

  // Clear cache for invalidated files and bump generations
  if (invalidates) {
    cache.invalidate(invalidates);
  }

  // Create pipeline for each file
  const filePipelines = specs.map(async (spec: TestSpecification) => {
    const testFilePath: string = spec.moduleId; // absolute path
    const project: TestProject = spec.project;
    const projectInfo = extractProjectInfo(spec);

    debug(`[Pipeline ${testFilePath}] Starting pipeline`);

    try {
      // PHASE 1: Compile
      const cached = await executePhase1Compilation(testFilePath, options, cache);

      // PHASE 2: Discover
      await executePhase2Discovery(testFilePath, cached, spec, project, options, pool);

      debug(`[Pipeline ${testFilePath}] Phase 2 complete, found ${cached.discoveredTests.length} tests`);

      // Get coverage mode
      const { isFailsafeMode } = getCoverageModeFlags(options);

      // Create file task for test execution
      const fileTask = createFileTask(
        testFilePath,
        projectInfo.projectRoot,
        projectInfo.projectName,
        POOL_NAME
      );
      fileTask.mode = 'run';

      // Add test tasks to file
      const testTasks: RunnerTestCase[] = [];
      for (const test of cached.discoveredTests) {
        const testTask: RunnerTestCase = {
          type: 'test',
          name: test.name,
          id: `${fileTask.id}_${test.name}`,
          context: {} as TestContext & object,
          suite: fileTask,
          mode: 'run',
          meta: {},
          file: fileTask,
          timeout: projectInfo.testTimeout,
          annotations: [],
        };
        fileTask.tasks.push(testTask);
        testTasks.push(testTask);
      }

      // PHASE 3: Execute all tests
      fileTask.result = { state: 'run', startTime: Date.now() };
      const testResults = await executePhase3Tests(
        testFilePath,
        cached,
        testTasks,
        project,
        options,
        pool,
        isFailsafeMode
      );

      // Accumulate coverage from these test runs into the coverage map
      if (isCoverageEnabled(options)) {
        if (!cached.debugInfo) {
          throw new Error(`Coverage is enabled, but debugInfo not available for ${testFilePath}`);
        }

        accumulateCoverage(testFilePath, testResults, cached.debugInfo);
      }

      // PHASE 4: Failsafe reruns
      if (isFailsafeMode) {
        await executePhase4FailsafeRerun(testFilePath, cached, testResults, testTasks, project, options, pool);
      }

      // PHASE 5: Finalize and report
      await executePhase5finalizeFileResults(testFilePath, fileTask, project, options, pool);

    } catch (error) {
      // Check if cache validation failure (acceptable, silent)
      if (error instanceof Error && error.message.startsWith(`${CACHE_INVALIDATED_ERROR_CODE}`)) {
        debug(`[Pipeline ${testFilePath}] ${error.message}`);
        return;
      }

      // All other errors: log to console and exit pipeline
      console.error(`[Pool] Error in pipeline for ${testFilePath}:`, error);
      return;
    }
  });

  // Wait for all file pipelines to complete
  await Promise.all(filePipelines);

  // Write coverage report
  // TODO - report this through Vitest
  if (isCoverageEnabled(options) && coverageMap.size > 0) {
    await writeCoverageReport(coverageMap, 'coverage/lcov.info');
  }

  debug('[Pool] runTests completed');
}

export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  // Read pool options and initialize debug mode
  const options = (ctx.config.poolOptions?.assemblyScript as PoolOptions) ?? {};
  setDebug(options.debug ?? false, options.debugTiming ?? false);

  // Create compilation cache instance
  const cache = createCompilationCache();

  debug('[Pool] Initializing AssemblyScript pool');

  // Worker path resolution
  // Workers must be pre-compiled JavaScript
  // Use `npm run build` or `npm run dev` (watch mode) before testing
  const workerPath = resolve(__dirname, 'worker/index.js');

  if (!existsSync(workerPath)) {
    throw new Error(`Worker file not found at ${workerPath}`);
  }

  debug('[Pool] Worker path:', workerPath);

  // Calculate worker thread count
  const cpus = os.availableParallelism?.() ?? os.cpus().length;
  const maxThreads = options.maxThreads ?? Math.max(cpus - 1, 1);

  debug('[Pool] Worker configuration - maxThreads:', maxThreads, 'isolate:', options.isolate ?? false);

  // Initialize Tinypool for worker management
  const pool = new Tinypool({
    filename: workerPath,
    isolateWorkers: options.isolate ?? false, // Safe: WASM isolated per test, worker code is stateless
    minThreads: 1,
    maxThreads,
  });

  return {
    name: 'vitest-pool-assemblyscript',

    async collectTests(specs: TestSpecification[]) {
      return collectTests(specs, options, cache, pool);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      return runTests(specs, options, cache, pool, invalidates);
    },

    /**
     * Cleanup when shutting down
     */
    async close() {
      debug('[Pool] Closing pool, clearing cache');
      cache.clear();
      coverageMap.clear();
      await pool.destroy();
      debug('[Pool] Tinypool destroyed');
    },
  };
}
