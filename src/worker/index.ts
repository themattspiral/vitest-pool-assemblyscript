/**
 * Worker entry point for Tinypool-based test execution
 *
 * This worker handles:
 * - AssemblyScript compilation (if not cached)
 * - Test discovery via WASM execution
 * - Test execution with RPC reporting for progressive UI updates
 * - Lifecycle event reporting (onQueued, onCollected, test-prepare, test-finished, suite-prepare, suite-finished)
 *
 * The worker has two exported functions accessed via Tinypool's `name` option:
 * - `collectTests()`: Discovery only (for `vitest list` command)
 * - `runTests()`: Discovery + execution with progressive reporting
 */

import type { RunnerTestCase, RunnerTestFile } from 'vitest/node';
import type { RuntimeRPC } from 'vitest';
import type { BirpcReturn } from 'birpc';

import type {
  WorkerCachedCompilation,
  DiscoveredTest,
  TestResult,
  PoolToWorkerData,
} from '../types.js';
import { compileAssemblyScript } from '../compiler.js';
import { discoverTests, executeTestsAndCollectCoverage } from '../executor/index.js';
import { setDebug, debug, debugTiming } from '../utils/debug.mjs';
import {
  createPhaseTimings,
  createRpcClient,
  createInitialFileTask,
  createFileTaskWithTests,
  reportFileQueued,
  reportFileCollected,
  reportSuitePrepare,
  reportSuiteFinished,
  reportTestPrepare,
  reportTestFinished,
  flushRpcUpdates,
  reportFileError,
} from './rpc-reporter.js';

/**
 * Result returned from collectTests worker function
 */
interface CollectTestsResult {
  /** Discovered tests */
  tests: DiscoveredTest[];
  /** Compiled data with generation (null if cache hit) */
  compiledData: WorkerCachedCompilation | null;
}

/**
 * Result returned from runTests worker function
 */
interface RunTestsResult {
  /** Compiled data with generation (null if cache hit) */
  compiledData: WorkerCachedCompilation | null;
}

/**
 * Compiled binary data (from cache or fresh compilation)
 */
interface CompiledBinary {
  binary: Uint8Array;
  sourceMap: string | null;
  coverageBinary?: Uint8Array;
  debugInfo: any;
  fromCache: boolean;
  generation?: number;
}

/**
 * Get or compile binary from cache or fresh compilation
 */
async function getOrCompileBinary(taskData: PoolToWorkerData): Promise<CompiledBinary> {
  if (taskData.cachedData) {
    debug('[Worker] Using cached binary for:', taskData.testFile);
    debugTiming(`[TIMING] ${taskData.testFile} - compile: cached`);
    return {
      binary: taskData.cachedData.binary,
      sourceMap: taskData.cachedData.sourceMap,
      coverageBinary: taskData.cachedData.coverageBinary,
      debugInfo: taskData.cachedData.debugInfo,
      fromCache: true,
    };
  }

  debug('[Worker] Cache miss, compiling:', taskData.testFile);
  const compileStart = performance.now();
  const result = await compileAssemblyScript(taskData.testFile, {
    coverage: taskData.options.coverage ?? 'dual',
    stripInline: taskData.options.stripInline ?? true,
  });
  const compileEnd = performance.now();
  debugTiming(`[TIMING] ${taskData.testFile} - compile: ${compileEnd - compileStart}ms`);

  if (result.error) {
    throw result.error;
  }

  return {
    binary: result.binary,
    sourceMap: result.sourceMap,
    coverageBinary: result.coverageBinary,
    debugInfo: result.debugInfo,
    fromCache: false,
    generation: taskData.generation,
  };
}

/**
 * Get or discover tests from binary
 *
 * NOTE: WebAssembly.Module cannot be serialized across worker boundaries (DataCloneError).
 * When using cached tests, we return module: null because the module was created in a previous
 * worker execution and cannot be transferred back from the pool. The executor will re-compile
 * the binary (which is fast - already parsed/validated) when module is null.
 *
 * Within a single worker execution (collectTests or runTests), we CAN pass the module from
 * discovery to execution to avoid re-compilation within the same worker task.
 *
 * @returns Discovery result with tests and optionally the compiled module (null if using cache)
 */
async function getOrDiscoverTests(
  binary: Uint8Array,
  testFile: string,
  cachedTests?: DiscoveredTest[]
): Promise<{ tests: DiscoveredTest[]; module: WebAssembly.Module | null }> {
  if (cachedTests) {
    debug('[Worker] Using cached test discovery for:', testFile);
    // Module cannot be serialized, so we can't cache it across worker boundaries
    return { tests: cachedTests, module: null };
  }

  debug('[Worker] Discovering tests for:', testFile);
  const { tests, module } = await discoverTests(binary, testFile);
  return { tests, module };
}

/**
 * Execute tests and report lifecycle events via RPC
 *
 * This function orchestrates test execution with progressive RPC reporting:
 * - Reports suite-prepare before execution
 * - Invokes callbacks for per-test lifecycle events (test-prepare, test-finished)
 * - Reports suite-finished after all tests complete
 * - Sends final RPC flush
 *
 * @param fileTask - File task representing the test suite
 * @param compiled - Compiled binary data (clean and optionally coverage binary)
 * @param tests - Discovered tests to execute
 * @param taskData - Task data from pool with options and configuration
 * @param rpc - RPC client for communication with main process
 * @param preCompiledModule - Optional pre-compiled module from discovery (avoids re-compilation)
 */
async function executeAndReportTests(
  fileTask: RunnerTestFile,
  compiled: CompiledBinary,
  tests: DiscoveredTest[],
  taskData: PoolToWorkerData,
  rpc: BirpcReturn<RuntimeRPC>,
  preCompiledModule?: WebAssembly.Module | null
): Promise<void> {
  // TODO [Phase 2 - Hooks]: Call reportHookStart(fileTask, 'beforeAll', rpc) here
  // Reference: .claude/analysis/assemblyscript_pool_rpc_gaps.md section 6

  // Report suite starting
  fileTask.result = { state: 'run', startTime: Date.now() };
  await reportSuitePrepare(rpc, fileTask);

  // Execute with per-test callbacks
  const callbacks = {
    onTestStart: async (_testName: string, testIndex: number) => {
      const testTask = fileTask.tasks[testIndex] as RunnerTestCase;
      await reportTestPrepare(rpc, testTask);
    },
    onTestFinished: async (_testName: string, testIndex: number, result: TestResult) => {
      const testTask = fileTask.tasks[testIndex] as RunnerTestCase;
      await reportTestFinished(rpc, testTask, result);
    },
  };

  debug('[Worker] Executing tests with RPC reporting');
  await executeTestsAndCollectCoverage(
    compiled.binary,
    compiled.sourceMap,
    compiled.coverageBinary,
    tests,
    taskData.testFile,
    callbacks,
    preCompiledModule ?? undefined
  );

  // TODO [Phase 2 - Hooks]: Call reportHookEnd(fileTask, 'afterAll', 'pass', rpc) here
  // Reference: .claude/analysis/assemblyscript_pool_rpc_gaps.md section 6

  // Calculate final state
  const fileEndTime = Date.now();
  const hasFailures = fileTask.tasks.some((task) => task.result?.state === 'fail');
  fileTask.result.duration = fileEndTime - fileTask.result.startTime!;
  fileTask.result.state = hasFailures ? 'fail' : 'pass';

  // Report suite finished
  await reportSuiteFinished(rpc, fileTask);

  // Final flush
  await flushRpcUpdates(rpc);
}

/**
 * Collect tests (discovery only, no execution)
 *
 * Called via `pool.run(taskData, { name: 'collectTests' })`
 */
export async function collectTests(taskData: PoolToWorkerData): Promise<CollectTestsResult> {
  setDebug(taskData.options.debug ?? false);
  const timings = createPhaseTimings();
  debug('[Worker] collectTests started for:', taskData.testFile);

  // Create RPC client
  const rpc = createRpcClient(taskData.port);
  debug('[Worker] RPC client established');

  // Report file as queued
  const fileTask = createInitialFileTask(taskData.testFile, taskData);
  await reportFileQueued(rpc, fileTask);

  // Compile binary
  const compiled = await getOrCompileBinary(taskData);
  timings.compileEnd = Date.now();

  // Discover tests
  const discoverStart = performance.now();
  const { tests } = await getOrDiscoverTests(
    compiled.binary,
    taskData.testFile,
    taskData.cachedData?.discoveredTests
  );
  const discoverEnd = performance.now();
  timings.discoverEnd = Date.now();
  debugTiming(`[TIMING] ${taskData.testFile} - discover: ${discoverEnd - discoverStart}ms`);
  debug('[Worker] collectTests complete, discovered', tests.length, 'tests');

  // Create complete file task with timing metadata
  const completeFileTask = createFileTaskWithTests(
    taskData.testFile,
    taskData,
    tests,
    timings
  );

  // Report via onCollected
  await reportFileCollected(rpc, completeFileTask);

  // Return tests and compiled data for pool to cache
  return {
    tests,
    compiledData: compiled.fromCache
      ? null
      : {
          binary: compiled.binary,
          sourceMap: compiled.sourceMap,
          coverageBinary: compiled.coverageBinary,
          debugInfo: compiled.debugInfo,
          discoveredTests: tests,
          generation: compiled.generation!,
        },
  };
}

/**
 * Run tests (discovery + execution with RPC reporting)
 *
 * Called via `pool.run(taskData, { name: 'runTests' })`
 */
export async function runTests(taskData: PoolToWorkerData): Promise<RunTestsResult> {
  setDebug(taskData.options.debug ?? false);
  const timings = createPhaseTimings();
  debug('[Worker] runTests started for:', taskData.testFile);

  // Create RPC client
  const rpc = createRpcClient(taskData.port);
  debug('[Worker] RPC client established');

  try {
    // Report file as queued
    const fileTask = createInitialFileTask(taskData.testFile, taskData);
    await reportFileQueued(rpc, fileTask);

    // Compile binary
    const compiled = await getOrCompileBinary(taskData);
    timings.compileEnd = Date.now();
    debug('[Worker] Binary ready, fromCache:', compiled.fromCache);

    // Discover tests
    const discoverStart = performance.now();
    const { tests, module } = await getOrDiscoverTests(
      compiled.binary,
      taskData.testFile,
      taskData.cachedData?.discoveredTests
    );
    const discoverEnd = performance.now();
    timings.discoverEnd = Date.now();
    debugTiming(`[TIMING] ${taskData.testFile} - discover: ${discoverEnd - discoverStart}ms`);
    debug('[Worker] Discovered', tests.length, 'tests');

    // Create complete file task with timing metadata
    const completeFileTask = createFileTaskWithTests(
      taskData.testFile,
      taskData,
      tests,
      timings
    );

    // Report via onCollected
    await reportFileCollected(rpc, completeFileTask);

    // Execute and report tests (pass module to avoid re-compilation)
    const executeStart = performance.now();
    await executeAndReportTests(completeFileTask, compiled, tests, taskData, rpc, module);
    const executeEnd = performance.now();
    debugTiming(`[TIMING] ${taskData.testFile} - execute: ${executeEnd - executeStart}ms (${tests.length} tests)`);

    debug('[Worker] runTests complete');

    // Return compiled data if cache miss
    return {
      compiledData: compiled.fromCache
        ? null
        : {
            binary: compiled.binary,
            sourceMap: compiled.sourceMap,
            coverageBinary: compiled.coverageBinary,
            debugInfo: compiled.debugInfo,
            discoveredTests: tests,
            generation: compiled.generation!,
          },
    };
  } catch (error) {
    debug('[Worker] Error in runTests:', error);

    // Report error
    const errorFileTask = createInitialFileTask(taskData.testFile, taskData);
    await reportFileError(rpc, errorFileTask, error);

    return { compiledData: null };
  }
}
