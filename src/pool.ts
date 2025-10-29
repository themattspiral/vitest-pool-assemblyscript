import type { ProcessPool, Vitest, TestProject, TestSpecification, RunnerTestCase } from 'vitest/node';
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
} from './types.js';
import { POOL_NAME } from './types.js';
import { setDebug, debug, debugTiming } from './utils/debug.mjs';
import { writeCoverageReport } from './coverage/lcov-reporter.js';
import { compileAssemblyScript } from './compiler.js';
import { createPhaseTimings } from './utils/timing.mjs';
import { createWorkerChannel } from './pool/worker-channel.js';
import { getCoverageModeFlags, isCoverageEnabled } from './pool/options.js';
import { createCompilationCache } from './pool/cache.js';

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
 *   All happening concurrently with maximum overlap!
 *
 * Key Principle: Start next phase ASAP
 *   - Discovery: Starts as soon as that file's compilation completes
 *   - Test Execution: Starts as soon as that file's discovery completes
 *   - Coverage: Starts as soon as test execution and binary compilation complete
 *   - No waiting for batches to complete!
 *
 * Benefits:
 *   - True parallelism: Fast-compiling files start discovery before slow files finish
 *   - Pipeline efficiency: Phases overlap across files, workers stay busy
 *   - Better CPU utilization: Can mix fast/slow work
 *   - No artificial batching: Each file progresses independently
 *   - Maximum throughput: All workers utilized throughout execution
 */

// Accumulate coverage data across all test files for single LCOV report
const coverageMap = new Map<string, FileCoverageData>();

// Single sequential compilation queue for V8 warmup
let compilationQueue: Promise<CachedCompilation> = Promise.resolve() as unknown as Promise<CachedCompilation>;

/**
 * Accumulate coverage data from multiple tests
 *
 * Takes an array of CoverageData (one per test) and aggregates them into
 * a single AggregatedCoverage object by summing hit counts.
 *
 * @param coverageArray - Array of per-test coverage data
 * @returns Aggregated coverage with summed hit counts
 */
function accumulateCoverage(coverageArray: CoverageData[]): AggregatedCoverage {
  return coverageArray.reduce((acc, cov) => {
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
}

/**
 * Queue compilation sequentially for V8 warmup
 *
 * Compiles once and returns both clean and instrumented binaries (when coverage enabled).
 * Sequential queueing maintains V8 JIT warmup benefits.
 *
 * @param testFile - Path to test file
 * @param options - Pool options
 * @param generation - Cache generation number for validation
 * @returns Promise that resolves with cached compilation
 */
async function queueCompilation(testFile: string, options: PoolOptions, generation: number): Promise<CachedCompilation> {
  const currentCompilation = compilationQueue.then(async () => {
    const timings = createPhaseTimings();

    // Single compilation returns both clean and instrumented binaries
    const compileResult = await compileAssemblyScript(testFile, {
      coverage: isCoverageEnabled(options),
      stripInline: options.stripInline ?? true,
    });

    timings.phaseEnd = performance.now();
    debugTiming(`[TIMING] ${testFile} - compile: ${timings.phaseEnd - timings.phaseStart}ms`);

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

export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  // Read pool options and initialize debug mode
  const options = (ctx.config.poolOptions?.assemblyScript as PoolOptions) ?? {};
  setDebug(options.debug ?? false, options.debugTiming ?? false);

  // Create compilation cache instance
  const cache = createCompilationCache();

  debug('[Pool] Initializing AssemblyScript pool with per-test parallelism');

  // Worker path resolution
  // Workers must be pre-compiled JavaScript
  // Use `npm run build` or `npm run dev` (watch mode) before testing
  const workerPath = resolve(__dirname, 'worker/index.js');

  if (!existsSync(workerPath)) {
    throw new Error(
      `Worker file not found at ${workerPath}. ` +
      `Run 'npm run build' before testing, or use 'npm run dev' for watch mode.`
    );
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

    /**
     * Discover tests via per-file pipeline: compile → discover
     * Called for `vitest list` command and in watch mode
     */
    async collectTests(specs: TestSpecification[]) {
      debug('[Pool] collectTests called for', specs.length, 'specs');

      // Create pipeline for each file
      const filePipelines = specs.map(async (spec: TestSpecification) => {
        const testFile: string = spec.moduleId;
        const project: TestProject = spec.project;

        // PHASE 1: Compile (queued sequentially for V8 warmup)
        let cached = cache.get(testFile);

        if (!cached) {
          try {
            const currentGen = cache.getCurrentGeneration(testFile);
            const result = await queueCompilation(testFile, options, currentGen);

            // Validate generation before caching
            if (!cache.validateAndCache(testFile, result)) {
              return { spec, tests: [] };
            }

            cached = result;
          } catch (error) {
            debug('[Pool] Compilation failed for', testFile, ':', error);
            return { spec, tests: [] };
          }
        }

        // PHASE 2: Discover tests (starts immediately after compile, always uses clean binary)
        if (cached.discoveredTests.length === 0) {
          const projectInfo = extractProjectInfo(spec);
          const { workerPort, poolPort, rpc: _rpc } = createWorkerChannel(project, false);

          try {
            const discoverTask: DiscoverTestsTask = {
              binary: cached.clean,
              testFile,
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

        return { spec, tests: cached.discoveredTests };
      });

      // Wait for all file pipelines to complete
      await Promise.all(filePipelines);

      debug('[Pool] collectTests completed');
    },

    /**
     * Run tests using true pipeline parallelism
     * Each file flows through its pipeline independently: compile → discover → execute tests
     * Pool handles suite-level RPC events, workers handle test-level events
     */
    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      debug('[Pool] runTests called for', specs.length, 'specs');
      debug('[Pool] Invalidated files:', invalidates?.length ?? 0);

      // Clear cache for invalidated files and bump generations
      if (invalidates) {
        cache.invalidate(invalidates);
      }

      // Create pipeline for each file
      const filePipelines = specs.map(async (spec: TestSpecification) => {
        const testFile: string = spec.moduleId;
        const project: TestProject = spec.project;
        const projectInfo = extractProjectInfo(spec);

        debug(`[Pipeline ${testFile}] Starting pipeline`);

        // PHASE 1: Compile (queued sequentially for V8 warmup)
        debug(`[Pipeline ${testFile}] Phase 1 (compile) starting`);
        let cached = cache.get(testFile);

        if (!cached) {
          try {
            const currentGen = cache.getCurrentGeneration(testFile);
            const result = await queueCompilation(testFile, options, currentGen);

            // Validate generation before caching
            if (!cache.validateAndCache(testFile, result)) {
              return;
            }

            cached = result;
          } catch (error) {
            debug('[Pool] Compilation failed for', testFile, ':', error);
            return;
          }
        }

        debug(`[Pipeline ${testFile}] Phase 1 (compile) complete, starting Phase 2 (discover)`);

        // PHASE 2: Discover tests (starts immediately after compile, always uses clean binary)
        if (cached.discoveredTests.length === 0) {
          const { workerPort: discoverPort, poolPort: discoverPoolPort, rpc: _rpc } = createWorkerChannel(project, false);

          try {
            const discoverTask: DiscoverTestsTask = {
              binary: cached.clean,
              testFile,
              options,
              port: discoverPort,
              projectInfo,
              compileTimings: cached.compileTimings,
              debugInfo: cached.debugInfo,
            };

            const discoverResult = await pool.run(discoverTask, {
              name: 'discoverTests',
              transferList: [discoverPort],
            }) as DiscoverTestsResult;

            cached.discoveredTests = discoverResult.tests;
            cached.discoverTimings = discoverResult.timings;
          } catch (error) {
            debug(`[Pipeline ${testFile}] Discovery failed:`, error);
            throw error;
          } finally {
            discoverPort.close();
            discoverPoolPort.close();
          }
        }

        debug(`[Pipeline ${testFile}] Phase 2 (discover) complete, found ${cached.discoveredTests.length} tests, starting Phase 3 (execute)`);

        // Get coverage mode flags for Phase 3 logic
        const { isIntegratedMode, isFailsafeMode } = getCoverageModeFlags(options);

        // Create file task for test execution
        const fileTask = createFileTask(
          testFile,
          projectInfo.projectRoot,
          projectInfo.projectName,
          POOL_NAME
        );
        fileTask.mode = 'run';
        fileTask.result = { state: 'run', startTime: Date.now() };

        // Add test tasks to file
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
        }

        // PHASE 3: Execute all tests for this file (starts immediately after discovery)
        const testExecutions = fileTask.tasks.map(async (testTask, testIndex) => {
          const test = cached!.discoveredTests[testIndex]!;

          // Create RPC channel for this test
          const { workerPort: testWorkerPort, poolPort: testPoolPort, rpc: _testRpc } = createWorkerChannel(project, false);

          try {
            // INTEGRATED/FAILSAFE MODE: Execute on instrumented binary with coverage
            if (!cached.instrumented || !cached.debugInfo) {
              throw new Error(`Instrumented binary not available for ${testFile}`);
            }

            const executeTask: ExecuteTestWithCoverageTask = {
              binary: cached.instrumented,
              sourceMap: cached!.sourceMap,
              debugInfo: cached.debugInfo,
              test,
              testIndex,
              testFile,
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
          } catch (error) {
            debug(`[Pipeline ${testFile}] Test execution failed:`, error);
            throw error;
          } finally {
            testWorkerPort.close();
            testPoolPort.close();
          }
        });

        // Wait for all tests in this file to complete
        const testResults = await Promise.all(testExecutions);

        debug(`[Pipeline ${testFile}] Phase 3 (execute) complete`);

        // Accumulate coverage based on mode
        if (isIntegratedMode) {
          // INTEGRATED MODE: Coverage collected during test execution (Phase 3)
          // Extract coverage from test results and accumulate
          debug(`[Pipeline ${testFile}] Accumulating integrated-mode coverage from test results`);

          if (!cached.debugInfo) {
            throw new Error(`debugInfo not available for ${testFile} in integrated mode`);
          }

          const allCoverage = testResults
            .map(({ result }) => result.coverage)
            .filter((cov): cov is CoverageData => cov !== undefined);

          if (allCoverage.length > 0) {
            const aggregatedCoverage = accumulateCoverage(allCoverage);

            coverageMap.set(testFile, {
              coverage: aggregatedCoverage,
              debugInfo: cached.debugInfo,
            });

            debug(`[Pipeline ${testFile}] Integrated-mode coverage accumulation complete`);
          }
        } else if (isFailsafeMode) {
          // FAILSAFE MODE: Smart re-run strategy
          // Phase 3 ran on instrumented binary (coverage collected + failures detected)
          // If failures exist, re-run only failed tests on clean binary for accurate errors
          debug(`[Pipeline ${testFile}] Failsafe mode: checking for failures`);

          if (!cached.debugInfo) {
            throw new Error(`debugInfo not available for ${testFile} in failsafe mode`);
          }

          // Accumulate coverage from Phase 3 (instrumented binary)
          const allCoverage = testResults
            .map(({ result }) => result.coverage)
            .filter((cov): cov is CoverageData => cov !== undefined);

          if (allCoverage.length > 0) {
            const aggregatedCoverage = accumulateCoverage(allCoverage);

            coverageMap.set(testFile, {
              coverage: aggregatedCoverage,
              debugInfo: cached.debugInfo,
            });

            debug(`[Pipeline ${testFile}] Failsafe mode: coverage accumulated from Phase 3`);
          }

          // Check for failures in Phase 3 results
          const failedResults = testResults.filter(({ result }) => !result.passed);

          if (failedResults.length > 0) {
            // Failures detected - re-run failed tests on clean binary for accurate error messages
            debug(`[Pipeline ${testFile}] Failsafe mode: ${failedResults.length} failures detected, re-running on clean binary`);

            // Re-run only failed tests on clean binary for accurate error messages
            const rerunExecutions = failedResults.map(async ({ testTask, result: _originalResult }) => {
              const testIndex = fileTask.tasks.indexOf(testTask);
              const test = cached!.discoveredTests[testIndex]!;

              const { workerPort: rerunPort, poolPort: rerunPoolPort, rpc: _rerunRpc } = createWorkerChannel(project, false);

              const rerunTask: ExecuteTestTask = {
                binary: cached!.clean,
                sourceMap: cached!.sourceMap,
                test,
                testIndex,
                testFile,
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
              } catch (error) {
                debug(`[Pipeline ${testFile}] Failsafe re-run failed:`, error);
                throw error;
              } finally {
                rerunPort.close();
                rerunPoolPort.close();
              }
            });

            // Wait for all re-runs to complete
            // Workers reported results via RPC during execution
            await Promise.all(rerunExecutions);

            debug(`[Pipeline ${testFile}] Failsafe mode: re-run complete, results reported for all previously failing tests`);

            // Check if any tests passed on clean after failing on instrumented
            // This indicates potential instrumentation issues
            for (const { testTask } of failedResults) {
              if (testTask.result?.state === 'pass') {
                // Test failed on instrumented but passed on clean - warn user
                console.warn(
                  `⚠️ Warning: Test '${testTask.name}' failed on instrumented binary but passed on clean binary.\n` +
                  `  This may indicate an issue with coverage instrumentation affecting test behavior.\n` +
                  `  File: ${testFile}`
                );
              }
            }
          } else {
            debug(`[Pipeline ${testFile}] Failsafe mode: no failures, skipping clean binary re-run`);
          }
        }

        // Update file task with final results
        const fileEndTime = Date.now();
        const hasFailures = fileTask.tasks.some((t) => t.result?.state === 'fail');
        fileTask.result.duration = fileEndTime - fileTask.result.startTime!;
        fileTask.result.state = hasFailures ? 'fail' : 'pass';

        // Report file summary (suite-finished + final flush)
        debug(`[Pipeline ${testFile}] Calling reportFileSummary`);
        const { workerPort: summaryPort, poolPort: summaryPoolPort, rpc: _summaryRpc } = createWorkerChannel(project, false);
        try {
          const summaryTask: ReportFileSummaryTask = {
            testFile,
            options,
            port: summaryPort,
            fileTask,
          };

          await pool.run(summaryTask, {
            name: 'reportFileSummary',
            transferList: [summaryPort],
          });
          debug(`[Pipeline ${testFile}] reportFileSummary completed`);
        } catch (error) {
          debug(`[Pipeline ${testFile}] Report file summary failed:`, error);
          throw error;
        } finally {
          summaryPort.close();
          summaryPoolPort.close();
        }

        return { fileTask, cached };
      });

      // Wait for all file pipelines to complete
      await Promise.all(filePipelines);

      // Write coverage report
      if (isCoverageEnabled(options) && coverageMap.size > 0) {
        await writeCoverageReport(coverageMap, 'coverage/lcov.info');
      }

      debug('[Pool] runTests completed');
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
