import type { ProcessPool, Vitest, TestProject, TestSpecification, RunnerTestFile } from 'vitest/node';
import { createMethodsRPC } from 'vitest/node';
import type { TaskResultPack } from '@vitest/runner';
import { createBirpc } from 'birpc';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { MessageChannel } from 'node:worker_threads';
import os from 'node:os';
import Tinypool from 'tinypool';

import type { PoolOptions, CachedCompilation, WorkerCachedCompilation, FileCoverageData } from './types.js';
import { setDebug, debug } from './utils/debug.mjs';
import { writeCoverageReport } from './coverage/lcov-reporter.js';

// ESM-compatible __dirname (import.meta.url is transformed by tsup/esbuild)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * AssemblyScript Pool for Vitest
 *
 * Per-Test Crash Isolation Architecture:
 * 1. collectTests(): Compile → Discover tests via callbacks → Cache binary
 * 2. runTests(): Reuse cached binary → Execute each test in fresh WASM instance
 * 3. Invalidation: Clear cache for changed files
 *
 * Key features:
 * - Per-test isolation: Each test runs in fresh WASM instance (~0.43ms overhead)
 * - Crash safe: One test aborting doesn't kill subsequent tests
 * - Import-based discovery: Tests register via __register_test callback during _start
 * - No double compilation: Binary cached between collect → run phases
 * - Supports whatever test patterns AS supports (limited by lack of closures)
 *
 * Coverage modes:
 * - false: No coverage - Fast, accurate errors
 * - true: Coverage only - Fast, broken errors on failure
 * - 'dual': Both coverage AND accurate errors - Slower (2x)
 *
 * Instrumentation:
 * - Test execution via --exportTable (function table export)
 * - Coverage via Binaryen __coverage_trace() injection (when enabled)
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
 * @param project - Vitest project with full TestProject object
 * @param collect - Whether this is for collection (true) or execution (false)
 * @returns Object with workerPort (to send to worker) and poolPort (for cleanup)
 */
function createWorkerChannel(project: TestProject, collect: boolean) {
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
    onTaskUpdate: async (packs: TaskResultPack[], events: any[]) => {
      debug('[Pool] RPC received onTaskUpdate with', packs.length, 'packs');
      return methods.onTaskUpdate(packs, events);
    },
  };

  // Create RPC in pool (has access to full TestProject)
  const rpc = createBirpc(
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
 * This prevents race conditions in watch mode where:
 * 1. Worker A starts compiling file.ts (generation 0)
 * 2. File changes, generation bumped to 1
 * 3. Worker B starts compiling file.ts (generation 1)
 * 4. Worker B finishes first, caches result (generation 1)
 * 5. Worker A finishes late, tries to cache stale result (generation 0)
 * 6. We reject Worker A's result because generation doesn't match
 *
 * @param testFile - Path to test file
 * @param workerData - Compilation data returned from worker (null if cache hit)
 * @returns true if cached, false if rejected (stale generation)
 *
 * NOTE: This function will be used when Tinypool worker integration is complete.
 * Currently unused but infrastructure is prepared for worker-based compilation.
 */
// @ts-ignore - Will be used for worker-based compilation
function validateAndCacheWorkerCompilation(
  testFile: string,
  workerData: WorkerCachedCompilation | null
): boolean {
  // If worker didn't compile (cache hit), nothing to validate or cache
  if (!workerData) {
    return false;
  }

  // Get current generation for this file
  const currentGen = cacheGeneration.get(testFile) ?? 0;

  // Validate generation matches
  if (workerData.generation !== currentGen) {
    debug('[Pool] Rejecting stale compilation for', testFile,
          '- worker generation:', workerData.generation,
          'current generation:', currentGen);
    return false;
  }

  // Generation matches - safe to cache
  const cached: CachedCompilation = {
    binary: workerData.binary,
    sourceMap: workerData.sourceMap,
    coverageBinary: workerData.coverageBinary,
    debugInfo: workerData.debugInfo,
    discoveredTests: workerData.discoveredTests,
  };

  compilationCache.set(testFile, cached);
  debug('[Pool] Cached worker compilation for', testFile, 'at generation:', currentGen);
  return true;
}



export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  // Read pool options and initialize debug mode
  const options = (ctx.config.poolOptions?.assemblyScript as PoolOptions) ?? {};
  setDebug(options.debug ?? false);

  debug('[Pool] Initializing AssemblyScript pool');

  // Worker path resolution
  // Workers must be pre-compiled JavaScript
  // Use `npm run build` or `npm run dev` (watch mode) before testing
  const workerPath = resolve(__dirname, 'worker.js');

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

  debug('[Pool] Worker configuration - maxThreads:', maxThreads, 'isolate:', options.isolate ?? true);

  // Initialize Tinypool for worker management
  const pool = new Tinypool({
    filename: workerPath,
    isolateWorkers: options.isolate ?? true,
    // isolateWorkers: false,
    minThreads: 1,
    maxThreads,
  });

  return {
    name: 'vitest-pool-assemblyscript',

    /**
     * Discover tests by compiling and executing WASM via worker
     * Called for `vitest list` command and in watch mode
     */
    async collectTests(specs: TestSpecification[]) {
      debug('[Pool] collectTests called for', specs.length, 'specs');

      // Run all test collection in parallel
      const promises = specs.map((spec: TestSpecification) => {
        const project: TestProject = spec.project;
        const testFile: string = spec.moduleId;
        debug('[Pool] Collecting tests from:', testFile);

        // Get cached data to send to worker (or undefined if cache miss)
        const cachedData = compilationCache.get(testFile);
        const generation = cacheGeneration.get(testFile) ?? 0;

        // Create MessageChannel and RPC for worker communication
        const { workerPort, poolPort } = createWorkerChannel(project, true);

        // Create cleanup callback for Tinypool to call when task finishes
        const onClose = () => {
          debug('[Pool] Closing ports for:', testFile);
          poolPort.close();
          workerPort.close();
        };

        // Return the promise from pool.run - don't await here
        return pool.run(
          {
            testFile,
            options,
            generation,
            cachedData,
            port: workerPort,
            projectRoot: project.config.root,
            projectName: project.name,
            testTimeout: project.config.testTimeout,
          },
          {
            name: 'collectTests',
            transferList: [workerPort],
            channel: { onClose },
          }
        ).then((result) => {
          // Cache compilation if worker compiled (cache miss)
          if (result.compiledData) {
            validateAndCacheWorkerCompilation(testFile, result.compiledData);
          }

          debug('[Pool] Collected', result.tests.length, 'tests from:', testFile);
          return result;
        }).catch((error) => {
          debug('[Pool] Error collecting tests from', testFile, ':', error);
          throw error;
        });
      });

      // Wait for all collections to complete
      await Promise.allSettled(promises);

      debug('[Pool] collectTests completed');
    },

    /**
     * Run tests using worker pool with RPC reporting
     * Workers handle compilation, discovery, execution, and progressive reporting
     */
    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      debug('[Pool] runTests called for', specs.length, 'specs');
      debug('[Pool] Invalidated files:', invalidates?.length ?? 0);

      // Clear cache for invalidated files and bump generations
      handleCacheInvalidations(invalidates);

      // Run all test files in parallel
      const promises = specs.map((spec: TestSpecification) => {
        const project: TestProject = spec.project;
        const testFile: string = spec.moduleId;
        debug('[Pool] Running tests in:', testFile);

        // Get cached data to send to worker (or undefined if cache miss)
        const cachedData = compilationCache.get(testFile);
        const generation = cacheGeneration.get(testFile) ?? 0;

        // Create MessageChannel and RPC for worker communication
        // Use collect: false for runTests so ctx._testRun methods get called (triggers reporters)
        const { workerPort, poolPort } = createWorkerChannel(project, false);

        // Create cleanup callback for Tinypool to call when task finishes
        const onClose = () => {
          debug('[Pool] Closing ports for:', testFile);
          poolPort.close();
          workerPort.close();
        };

        // Return the promise from pool.run - don't await here
        return pool.run(
          {
            testFile,
            options,
            generation,
            cachedData,
            port: workerPort,
            projectRoot: project.config.root,
            projectName: project.name,
            testTimeout: project.config.testTimeout,
          },
          {
            name: 'runTests',
            transferList: [workerPort],
            channel: { onClose },
          }
        ).then((result) => {
          // Cache compilation if worker compiled (cache miss)
          if (result.compiledData) {
            validateAndCacheWorkerCompilation(testFile, result.compiledData);
          }

          // Accumulate coverage if present
          if (result.coverageData && result.debugInfo) {
            coverageMap.set(testFile, {
              coverage: result.coverageData,
              debugInfo: result.debugInfo,
            });
          }

          return result;
        }).catch((error) => {
          debug('[Pool] Error running tests in', testFile, ':', error);
          throw error;
        });
      });

      // Wait for all test files to complete
      const results = await Promise.allSettled(promises);

      // Check for errors
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason);

      if (errors.length > 0) {
        debug('[Pool] Errors occurred in', errors.length, 'files');
        // Don't throw - errors already reported to Vitest via RPC
      }

      // Write single LCOV file with all coverage data
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


