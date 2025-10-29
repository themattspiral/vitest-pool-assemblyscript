import type { ProcessPool, Vitest, TestProject, TestSpecification, RunnerTestFile, RunnerTestCase } from 'vitest/node';
import { createMethodsRPC } from 'vitest/node';
import type { RuntimeRPC } from 'vitest';
import type { TaskResultPack, TaskEventPack, TestContext } from '@vitest/runner';
import { createBirpc } from 'birpc';
import { createFileTask } from '@vitest/runner/utils';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { MessageChannel } from 'node:worker_threads';
import os from 'node:os';
import Tinypool from 'tinypool';

import type {
  PoolOptions,
  CachedCompilation,
  CoverageBinaryResult,
  DiscoverTestsTask,
  DiscoverTestsResult,
  ExecuteTestTask,
  ExecuteTestWithCoverageTask,
  ExecuteTestResult,
  CollectCoverageOnlyTask,
  ReportFileSummaryTask,
  FileCoverageData,
  AggregatedCoverage,
  CoverageData,
  ProjectInfo,
  WorkerChannel,
  CoverageModeFlags,
} from './types.js';
import { POOL_NAME } from './types.js';
import { setDebug, debug, debugTiming } from './utils/debug.mjs';
import { writeCoverageReport } from './coverage/lcov-reporter.js';
import { compileAssemblyScript } from './compiler.js';
import { createPhaseTimings } from './utils/timing.mjs';

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

// Cache compiled WASM binaries and source maps between collectTests() and runTests()
const compilationCache = new Map<string, CachedCompilation>();

// Track cache generation for invalidation validation (prevents stale worker compilations)
const cacheGeneration = new Map<string, number>();

// Accumulate coverage data across all test files for single LCOV report
const coverageMap = new Map<string, FileCoverageData>();

// Two separate sequential queues for clean and coverage compilation
// This enables pipeline parallelism while maintaining V8 warmup in each queue
let cleanCompilationQueue: Promise<CachedCompilation> = Promise.resolve() as unknown as Promise<CachedCompilation>;
let coverageCompilationQueue: Promise<CoverageBinaryResult> = Promise.resolve() as unknown as Promise<CoverageBinaryResult>;

// Track coverage compilation promises to await before coverage phase
const coverageCompilationPromises = new Map<string, Promise<CoverageBinaryResult>>();

/**
 * Get coverage mode flags for easy destructuring
 *
 * @param options - Pool options
 * @returns Mode flags for conditional logic
 * @example
 * const { isFailsafeMode, isDualMode } = getCoverageModeFlags(options);
 */
function getCoverageModeFlags(options: PoolOptions): CoverageModeFlags {
  // TODO: In Phase 4h, check Vitest's test.coverage.enabled first
  // For now, if coverageMode is undefined, default to 'failsafe'
  const mode = options.coverageMode ?? 'failsafe';

  return {
    mode,
    isIntegratedMode: mode === 'integrated',
    isFailsafeMode: mode === 'failsafe',
    isDualMode: mode === 'dual',
  };
}

/**
 * Check if coverage is enabled at all
 */
function isCoverageEnabled(_options: PoolOptions): boolean {
  // TODO: In Phase 4h, check Vitest's test.coverage.enabled
  // For now, coverage is always enabled (controlled by coverageMode)
  return true;
}

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
 * Queue primary binary compilation sequentially for V8 warmup
 *
 * @param testFile - Path to test file
 * @param options - Pool options
 * @param generation - Cache generation number for validation
 * @returns Promise that resolves when primary binary is compiled
 */
async function queueCompilation(testFile: string, options: PoolOptions, generation: number): Promise<CachedCompilation> {
  // Decide whether primary binary should be instrumented
  const { isIntegratedMode, isFailsafeMode } = getCoverageModeFlags(options);
  const compilePrimaryWithCoverage = isIntegratedMode || isFailsafeMode;

  const currentCompilation = cleanCompilationQueue.then(() =>
    compilePrimaryBinary(testFile, compilePrimaryWithCoverage, options, generation)
  );
  cleanCompilationQueue = currentCompilation.catch((err) => {
    throw err;
  });
  return currentCompilation;
}

/**
 * Compile primary binary (the binary we run Phase 3 tests on)
 *
 * @param testFile - Path to test file
 * @param withCoverage - Whether to compile with coverage instrumentation
 * @param options - Pool options
 * @param generation - Cache generation number
 * @returns Compilation with primary binary
 */
async function compilePrimaryBinary(
  testFile: string,
  withCoverage: boolean,
  options: PoolOptions,
  generation: number
): Promise<CachedCompilation> {
  const timings = createPhaseTimings();

  const compileResult = await compileAssemblyScript(testFile, {
    coverage: withCoverage,
    stripInline: options.stripInline ?? true,
  });

  timings.phaseEnd = performance.now();
  debugTiming(`[TIMING] ${testFile} - compile: ${timings.phaseEnd - timings.phaseStart}ms`);

  if (compileResult.error) {
    throw compileResult.error;
  }

  // If primary binary is instrumented, it can serve as coverage binary
  const coverageBinary = withCoverage ? compileResult.binary : undefined;

  return {
    binary: compileResult.binary,
    sourceMap: compileResult.sourceMap,
    coverageBinary,
    debugInfo: compileResult.debugInfo,
    discoveredTests: [],
    compileTimings: timings,
    generation,
  };
}

/**
 * Compile coverage binary (with strip-inline transform)
 *
 * @param testFile - Path to test file
 * @param options - Pool options
 * @returns Coverage binary and debug info for coverage reporting
 */
async function compileCoverageBinary(testFile: string, options: PoolOptions): Promise<CoverageBinaryResult> {
  const coverageTimings = createPhaseTimings();
  const coverageResult = await compileAssemblyScript(testFile, {
    coverage: true,
    stripInline: options.stripInline ?? true,
  });
  coverageTimings.phaseEnd = performance.now();
  debugTiming(`[TIMING] ${testFile} - coverage binary compile: ${coverageTimings.phaseEnd - coverageTimings.phaseStart}ms`);

  if (coverageResult.error) {
    throw coverageResult.error;
  }

  if (!coverageResult.debugInfo) {
    throw new Error('Coverage compilation should always produce debugInfo');
  }

  return {
    binary: coverageResult.binary,
    debugInfo: coverageResult.debugInfo,
  };
}

/**
 * Queue coverage binary compilation in separate sequential queue (for V8 warmup)
 *
 * Coverage queue is independent from clean queue, enabling pipeline parallelism
 * while still maintaining sequential execution within each queue for V8 warmup.
 *
 * @param testFile - Path to test file
 * @param options - Pool options
 * @returns Promise that resolves with coverage binary and debug info
 */
async function queueCoverageCompilation(testFile: string, options: PoolOptions): Promise<CoverageBinaryResult> {
  const currentCompilation = coverageCompilationQueue.then(() => compileCoverageBinary(testFile, options));
  coverageCompilationQueue = currentCompilation.catch((err) => {
    throw err;
  });
  return currentCompilation;
}

/**
 * Create a MessageChannel with RPC for worker communication
 *
 * This is used for suite-level events (onQueued, onCollected, suite-prepare, suite-finished).
 * Test-level events are reported directly by workers via their own MessagePorts.
 *
 * @param project - Vitest project with full TestProject object
 * @param collect - Whether this is for collection (true) or execution (false)
 * @returns Object with workerPort (to send to worker) and poolPort (for cleanup) and rpc client
 */
function createWorkerChannel(project: TestProject, collect: boolean): WorkerChannel {
  const channel = new MessageChannel();
  const workerPort = channel.port1;
  const poolPort = channel.port2;

  debug('[Pool] Creating RPC with collect:', collect);

  // Wrap the methods to add logging
  const methods = createMethodsRPC(project, { collect });
  const wrappedMethods = {
    ...methods,
    onCollected: async (files: RunnerTestFile[]) => {
      debug('[Pool] RPC received onCollected with', files.length, 'files, collect:', collect);
      debug('[Pool] First file - id:', files[0]?.id, 'filepath:', files[0]?.filepath, 'tasks:', files[0]?.tasks?.length);
      return methods.onCollected(files);
    },
    onTaskUpdate: async (packs: TaskResultPack[], events: TaskEventPack[]) => {
      debug('[Pool] RPC received onTaskUpdate with', packs.length, 'packs');
      return methods.onTaskUpdate(packs, events);
    },
  };

  // Create RPC in pool (has access to full TestProject)
  const rpc = createBirpc<RuntimeRPC, typeof wrappedMethods>(
    wrappedMethods,
    {
      post: (v) => poolPort.postMessage(v),
      on: (fn) => poolPort.on('message', fn),
    }
  );

  return { workerPort, poolPort, rpc };
}

/**
 * Clear compilation cache for invalidated files and bump generation numbers
 *
 * Generation numbers prevent stale compilations from late-returning workers
 * from populating the cache after a file has been invalidated. When a worker
 * returns compilation results, we validate that the generation matches the
 * current value before caching.
 *
 * @param invalidates - List of invalidated file paths
 */
function handleCacheInvalidations(invalidates: string[] | undefined): void {
  if (!invalidates) return;

  for (const file of invalidates) {
    // Clear cache for invalidated file
    if (compilationCache.has(file)) {
      compilationCache.delete(file);
      debug('[Pool] Cleared cache for:', file);
    }

    // Bump generation number to invalidate in-flight worker compilations
    const currentGen = cacheGeneration.get(file) ?? 0;
    cacheGeneration.set(file, currentGen + 1);
    debug('[Pool] Bumped generation for', file, 'to:', currentGen + 1);
  }
}

/**
 * Validate and cache compilation results
 *
 * Validates that the generation number matches the current generation for the file.
 * If they match, caches the compilation. If they don't match, the file was invalidated
 * during compilation, so we discard the stale result.
 *
 * @param testFile - Path to test file
 * @param compileResult - Compilation result from pool
 * @returns true if cached, false if rejected (stale generation)
 */
function validateAndCacheCompilation(
  testFile: string,
  compileResult: CachedCompilation
): boolean {
  // Get current generation for this file
  const currentGen = cacheGeneration.get(testFile) ?? 0;

  // Validate generation matches
  if (compileResult.generation !== currentGen) {
    debug('[Pool] Rejecting stale compilation for', testFile,
          '- result generation:', compileResult.generation,
          'current generation:', currentGen);
    return false;
  }

  // Generation matches - safe to cache
  compilationCache.set(testFile, compileResult);
  debug('[Pool] Cached compilation for', testFile, 'at generation:', currentGen);
  return true;
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

        // PHASE 1: Compile clean binary (queued sequentially for V8 warmup)
        let cached = compilationCache.get(testFile);

        if (!cached) {
          try {
            const currentGen = cacheGeneration.get(testFile) ?? 0;
            const result = await queueCompilation(testFile, options, currentGen);

            // Validate generation before caching
            if (!validateAndCacheCompilation(testFile, result)) {
              return { spec, tests: [] };
            }

            cached = result;

            // Queue separate coverage binary compilation (only for 'dual' mode)
            // - 'dual': needs separate instrumented binary for Phase 4
            // - 'failsafe': primary is already instrumented, clean binary compiled on-demand if needed
            // - 'integrated': primary is already instrumented, no separate binary needed
            const { isDualMode } = getCoverageModeFlags(options);
            if (isDualMode) {
              const coveragePromise = queueCoverageCompilation(testFile, options);
              coverageCompilationPromises.set(testFile, coveragePromise);
            }
          } catch (error) {
            debug('[Pool] Compilation failed for', testFile, ':', error);
            return { spec, tests: [] };
          }
        }

        // PHASE 2: Discover tests (starts immediately after clean compile)
        if (cached.discoveredTests.length === 0) {
          const projectInfo = extractProjectInfo(spec);
          const { workerPort, poolPort, rpc: _rpc } = createWorkerChannel(project, false);

          try {
            const discoverTask: DiscoverTestsTask = {
              binary: cached.binary,
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
      handleCacheInvalidations(invalidates);

      // Create pipeline for each file
      const filePipelines = specs.map(async (spec: TestSpecification) => {
        const testFile: string = spec.moduleId;
        const project: TestProject = spec.project;
        const projectInfo = extractProjectInfo(spec);

        debug(`[Pipeline ${testFile}] Starting pipeline`);

        // PHASE 1: Compile clean binary (queued sequentially for V8 warmup)
        debug(`[Pipeline ${testFile}] Phase 1 (compile) starting`);
        let cached = compilationCache.get(testFile);

        if (!cached) {
          try {
            const currentGen = cacheGeneration.get(testFile) ?? 0;
            const result = await queueCompilation(testFile, options, currentGen);

            // Validate generation before caching
            if (!validateAndCacheCompilation(testFile, result)) {
              return;
            }

            cached = result;

            // Queue separate coverage binary compilation (only for 'dual' mode)
            // - 'dual': needs separate instrumented binary for Phase 4
            // - 'failsafe': primary is already instrumented, clean binary compiled on-demand if needed
            // - 'integrated': primary is already instrumented, no separate binary needed
            const { isDualMode } = getCoverageModeFlags(options);
            if (isDualMode) {
              const coveragePromise = queueCoverageCompilation(testFile, options);
              coverageCompilationPromises.set(testFile, coveragePromise);
            }
          } catch (error) {
            debug('[Pool] Compilation failed for', testFile, ':', error);
            return;
          }
        }

        debug(`[Pipeline ${testFile}] Phase 1 (compile) complete, starting Phase 2 (discover)`);

        // PHASE 2: Discover tests (starts immediately after compile)
        if (cached.discoveredTests.length === 0) {
          const { workerPort: discoverPort, poolPort: discoverPoolPort, rpc: _rpc } = createWorkerChannel(project, false);

          try {
            const discoverTask: DiscoverTestsTask = {
              binary: cached.binary,
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
          } finally {
            discoverPort.close();
            discoverPoolPort.close();
          }
        }

        debug(`[Pipeline ${testFile}] Phase 2 (discover) complete, found ${cached.discoveredTests.length} tests, starting Phase 3 (execute)`);

        // Get coverage mode flags for Phase 3 and Phase 4 logic
        const { isIntegratedMode, isFailsafeMode, isDualMode } = getCoverageModeFlags(options);

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
            let result: ExecuteTestResult;

            if (isDualMode) {
              // DUAL MODE: Execute on clean binary, no coverage (Phase 4 collects coverage separately)
              const executeTask: ExecuteTestTask = {
                binary: cached!.binary,
                sourceMap: cached!.sourceMap,
                test,
                testIndex,
                testFile,
                options,
                port: testWorkerPort,
                testTaskId: testTask.id,
                testTaskName: testTask.name,
              };

              result = await pool.run(executeTask, {
                name: 'executeTest',
                transferList: [testWorkerPort],
              }) as ExecuteTestResult;
            } else {
              // INTEGRATED/FAILSAFE MODE: Execute on instrumented binary with coverage
              const executeTask: ExecuteTestWithCoverageTask = {
                binary: cached!.binary,
                sourceMap: cached!.sourceMap,
                debugInfo: cached!.debugInfo!,
                test,
                testIndex,
                testFile,
                options,
                port: testWorkerPort,
                testTaskId: testTask.id,
                testTaskName: testTask.name,
                suppressFailureReporting: isFailsafeMode,  // Only true for failsafe mode
              };

              result = await pool.run(executeTask, {
                name: 'executeTestWithCoverage',
                transferList: [testWorkerPort],
              }) as ExecuteTestResult;
            }

            return { testTask, result: result.result };
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

          const allCoverage = testResults
            .map(({ result }) => result.coverage)
            .filter((cov): cov is CoverageData => cov !== undefined);

          if (allCoverage.length > 0 && cached!.debugInfo) {
            const aggregatedCoverage = accumulateCoverage(allCoverage);

            coverageMap.set(testFile, {
              coverage: aggregatedCoverage,
              debugInfo: cached!.debugInfo,
            });

            debug(`[Pipeline ${testFile}] Integrated-mode coverage accumulation complete`);
          }
        } else if (isFailsafeMode) {
          // FAILSAFE MODE: Smart re-run strategy
          // Phase 3 ran on instrumented binary (coverage collected + failures detected)
          // If failures exist, compile clean binary and re-run only failed tests for accurate errors
          debug(`[Pipeline ${testFile}] Failsafe mode: checking for failures`);

          // Accumulate coverage from Phase 3 (instrumented binary)
          const allCoverage = testResults
            .map(({ result }) => result.coverage)
            .filter((cov): cov is CoverageData => cov !== undefined);

          if (allCoverage.length > 0 && cached!.debugInfo) {
            const aggregatedCoverage = accumulateCoverage(allCoverage);

            coverageMap.set(testFile, {
              coverage: aggregatedCoverage,
              debugInfo: cached!.debugInfo,
            });

            debug(`[Pipeline ${testFile}] Failsafe mode: coverage accumulated from Phase 3`);
          }

          // Check for failures in Phase 3 results
          const failedResults = testResults.filter(({ result }) => !result.passed);

          if (failedResults.length > 0) {
            // Failures detected - compile clean binary and re-run failed tests
            debug(`[Pipeline ${testFile}] Failsafe mode: ${failedResults.length} failures detected, compiling clean binary`);

            try {
              // Compile clean binary on-demand (outside queue - emergency compilation)
              const cleanBinary = await compilePrimaryBinary(testFile, false, options, cached!.generation);

              debug(`[Pipeline ${testFile}] Failsafe mode: re-running ${failedResults.length} failed tests on clean binary`);

              // Re-run only failed tests on clean binary for accurate error messages
              const rerunExecutions = failedResults.map(async ({ testTask, result: _originalResult }) => {
                const testIndex = fileTask.tasks.indexOf(testTask);
                const test = cached!.discoveredTests[testIndex]!;

                const { workerPort: rerunPort, poolPort: rerunPoolPort, rpc: _rerunRpc } = createWorkerChannel(project, false);

                const rerunTask: ExecuteTestTask = {
                  binary: cleanBinary.binary,
                  sourceMap: cleanBinary.sourceMap,
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
                } finally {
                  rerunPort.close();
                  rerunPoolPort.close();
                }
              });

              // Wait for all re-runs to complete
              // Workers reported results via RPC during execution
              await Promise.all(rerunExecutions);

              debug(`[Pipeline ${testFile}] Failsafe mode: re-run complete, results reported for all previously failing tests`);
            } catch (error) {
              debug(`[Pipeline ${testFile}] Failsafe mode: clean binary compilation failed:`, error);
              // Keep original instrumented results if clean compilation fails
            }
          } else {
            debug(`[Pipeline ${testFile}] Failsafe mode: no failures, skipping clean binary compilation`);
          }
        } else if (isDualMode) {
          // DUAL MODE: Always run both clean and instrumented binaries
          // Phase 3 ran on clean binary (accurate errors), Phase 4 collects coverage from instrumented binary
          debug(`[Pipeline ${testFile}] Starting Phase 4 (collect coverage and accumulate)`);

          // Await coverage binary compilation if needed
          if (!cached.coverageBinary) {
            const coveragePromise = coverageCompilationPromises.get(testFile);
            if (coveragePromise) {
              debug(`[Pipeline ${testFile}] Awaiting coverage binary compilation`);
              const coverageResult = await coveragePromise;
              cached.coverageBinary = coverageResult.binary;
              cached.debugInfo = coverageResult.debugInfo;
              coverageCompilationPromises.delete(testFile);
            }
          }

          if (!cached.coverageBinary) {
            debug(`[Pipeline ${testFile}] No coverage binary available, skipping coverage collection`);
          } else if (!cached.debugInfo) {
            debug(`[Pipeline ${testFile}] No debugInfo available, skipping coverage collection`);
          } else {
            // Collect coverage for each test (in parallel)
            const coverageExecutions = cached.discoveredTests.map(async (test) => {
              const coverageTask: CollectCoverageOnlyTask = {
                coverageBinary: cached.coverageBinary!,
                debugInfo: cached.debugInfo!,
                test,
                testFile,
                options,
              };

              const coverage = await pool.run(coverageTask, {
                name: 'collectCoverageOnly',
              }) as CoverageData;

              return coverage;
            });

            // Wait for all coverage collection to complete
            const allCoverage = await Promise.all(coverageExecutions);

            // Accumulate coverage for LCOV reporting
            if (cached.debugInfo) {
              const aggregatedCoverage = accumulateCoverage(allCoverage);

              coverageMap.set(testFile, {
                coverage: aggregatedCoverage,
                debugInfo: cached.debugInfo,
              });
            }

            debug(`[Pipeline ${testFile}] Phase 4 (dual-mode coverage) complete`);
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
      compilationCache.clear();
      coverageMap.clear();
      await pool.destroy();
      debug('[Pool] Tinypool destroyed');
    },
  };
}
