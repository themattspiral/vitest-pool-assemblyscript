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
  CompileFileTask,
  CompileFileResult,
  DiscoverTestsTask,
  DiscoverTestsResult,
  ExecuteTestTask,
  ExecuteTestResult,
  ReportFileSummaryTask,
  FileCoverageData,
  ProjectInfo,
  WorkerChannel,
} from './types.js';
import { POOL_NAME } from './types.js';
import { setDebug, debug } from './utils/debug.mjs';
import { writeCoverageReport } from './coverage/lcov-reporter.js';

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
 * Validate and cache worker compilation results
 *
 * Validates that the generation number from the worker matches the current
 * generation for the file. If they match, caches the compilation. If they
 * don't match, the file was invalidated while the worker was compiling, so
 * we discard the stale result.
 *
 * @param testFile - Path to test file
 * @param compileResult - Compilation result from worker
 * @returns true if cached, false if rejected (stale generation)
 */
function validateAndCacheCompilation(
  testFile: string,
  compileResult: CompileFileResult
): boolean {
  // Get current generation for this file
  const currentGen = cacheGeneration.get(testFile) ?? 0;

  // Validate generation matches
  if (compileResult.generation !== currentGen) {
    debug('[Pool] Rejecting stale compilation for', testFile,
          '- worker generation:', compileResult.generation,
          'current generation:', currentGen);
    return false;
  }

  // Generation matches - safe to cache (discoveredTests will be added in Phase 2)
  const cached: CachedCompilation = {
    binary: compileResult.binary,
    sourceMap: compileResult.sourceMap,
    coverageBinary: compileResult.coverageBinary,
    debugInfo: compileResult.debugInfo,
    discoveredTests: [], // Will be populated after discovery
    compileTimings: compileResult.timings,
  };

  compilationCache.set(testFile, cached);
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
  setDebug(options.debug ?? false);

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

      // Create pipeline for each file - each flows independently through phases
      const filePipelines = specs.map(async (spec: TestSpecification) => {
        const testFile: string = spec.moduleId;
        const project: TestProject = spec.project;

        // PHASE 1: Compile this file
        let cached = compilationCache.get(testFile);

        if (!cached) {
          const generation = cacheGeneration.get(testFile) ?? 0;
          const compileTask: CompileFileTask = {
            testFile,
            options,
            generation,
          };

          const compileResult = await pool.run(compileTask, { name: 'compileFile' }) as CompileFileResult;

          // Validate and cache
          const success = validateAndCacheCompilation(testFile, compileResult);
          if (!success) {
            throw new Error(`Failed to cache compilation for ${testFile} (stale generation)`);
          }

          cached = compilationCache.get(testFile)!;
        }

        // PHASE 2: Discover tests (starts immediately after compile)
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

      // Create pipeline for each file - each flows independently through phases
      const filePipelines = specs.map(async (spec: TestSpecification) => {
        const testFile: string = spec.moduleId;
        const project: TestProject = spec.project;
        const projectInfo = extractProjectInfo(spec);

        debug(`[Pipeline ${testFile}] Starting pipeline`);

        // PHASE 1: Compile this file
        debug(`[Pipeline ${testFile}] Phase 1 (compile) starting`);
        let cached = compilationCache.get(testFile);

        if (!cached) {
          const generation = cacheGeneration.get(testFile) ?? 0;
          const compileTask: CompileFileTask = {
            testFile,
            options,
            generation,
          };

          const compileResult = await pool.run(compileTask, { name: 'compileFile' }) as CompileFileResult;

          // Validate and cache
          const success = validateAndCacheCompilation(testFile, compileResult);
          if (!success) {
            throw new Error(`Failed to cache compilation for ${testFile} (stale generation)`);
          }

          cached = compilationCache.get(testFile)!;
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

          const executeTask: ExecuteTestTask = {
            binary: cached!.binary,
            sourceMap: cached!.sourceMap,
            coverageBinary: options.coverage === true ? cached!.coverageBinary : undefined,
            test,
            testIndex,
            testFile,
            options,
            port: testWorkerPort,
            testTaskId: testTask.id,
            testTaskName: testTask.name,
          };

          try {
            const result = await pool.run(executeTask, {
              name: 'executeTest',
              transferList: [testWorkerPort],
            }) as ExecuteTestResult;

            return { testTask, result: result.result };
          } finally {
            testWorkerPort.close();
            testPoolPort.close();
          }
        });

        // Wait for all tests in this file to complete
        await Promise.all(testExecutions);

        debug(`[Pipeline ${testFile}] Phase 3 (execute) complete`);

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

      // Write coverage
      if (options.coverage && coverageMap.size > 0) {
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
