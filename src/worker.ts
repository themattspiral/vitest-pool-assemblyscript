/**
 * Worker entry point for Tinypool-based test execution
 *
 * This worker handles:
 * - AssemblyScript compilation (if not cached)
 * - Test discovery via WASM execution
 * - Test execution with RPC reporting for progressive UI updates
 * - Throttled update batching (100ms) with flush-on-complete
 * - Console logging via RPC
 *
 * The worker has two exported functions accessed via Tinypool's `name` option:
 * - `collectTests()`: Discovery only (for `vitest list` command)
 * - `runTests()`: Discovery + execution with progressive reporting
 */

import type { RunnerTestCase, RunnerTestFile } from 'vitest/node';
import type { RuntimeRPC } from 'vitest';
import { createBirpc, type BirpcReturn } from 'birpc';
import type { TaskResultPack, TaskEventPack } from '@vitest/runner';
import { createFileTask } from '@vitest/runner/utils';

import type {
  WorkerCachedCompilation,
  DiscoveredTest,
  TestResult,
  PoolToWorkerData,
} from './types.js';
import { POOL_NAME } from './types.js';
import { compileAssemblyScript } from './compiler.js';
import { discoverTests, executeTestsAndCollectCoverage } from './executor.js';
import { setDebug, debug } from './utils/debug.mjs';

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
 *
 * @param taskData - Task data with cached data and generation
 * @returns Compiled binary data
 */
async function getOrCompileBinary(taskData: PoolToWorkerData): Promise<CompiledBinary> {
  if (taskData.cachedData) {
    debug('[Worker] Using cached binary for:', taskData.testFile);
    return {
      binary: taskData.cachedData.binary,
      sourceMap: taskData.cachedData.sourceMap,
      coverageBinary: taskData.cachedData.coverageBinary,
      debugInfo: taskData.cachedData.debugInfo,
      fromCache: true,
    };
  }

  debug('[Worker] Cache miss, compiling:', taskData.testFile);
  const result = await compileAssemblyScript(taskData.testFile, {
    coverage: taskData.options.coverage ?? 'dual',
    stripInline: taskData.options.stripInline ?? true,
  });

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
 * @param binary - WASM binary
 * @param testFile - Path to test file
 * @param cachedTests - Cached discovered tests (if available)
 * @returns Discovered tests
 */
async function getOrDiscoverTests(
  binary: Uint8Array,
  testFile: string,
  cachedTests?: DiscoveredTest[]
): Promise<DiscoveredTest[]> {
  if (cachedTests) {
    debug('[Worker] Using cached test discovery for:', testFile);
    return cachedTests;
  }

  debug('[Worker] Discovering tests for:', testFile);
  return await discoverTests(binary, testFile);
}

/**
 * Create file task with discovered tests and report via RPC
 *
 * @param testFile - Path to test file
 * @param taskData - Task data with project info
 * @param rpc - RPC methods for communication
 * @param options - Optional configuration
 * @param options.tests - Discovered tests to add as test tasks (omit for error-only file task)
 * @param options.error - Error to report as file-level failure (for compilation/discovery errors)
 * @returns Created file task
 */
async function createAndReportFileTask(
  testFile: string,
  taskData: PoolToWorkerData,
  rpc: BirpcReturn<RuntimeRPC>,
  options?: {
    tests?: DiscoveredTest[];
    error?: unknown;
  }
): Promise<RunnerTestFile> {
  // Create file task structure
  const fileTask = createFileTask(
    testFile,
    taskData.projectRoot,
    taskData.projectName,
    POOL_NAME
  );
  fileTask.mode = 'run';

  // Add test tasks if provided (success case)
  if (options?.tests) {
    for (const test of options.tests) {
      const testTask: RunnerTestCase = {
        type: 'test',
        name: test.name,
        id: `${fileTask.id}_${test.name}`,
        context: {} as any,
        suite: fileTask,
        mode: 'run',
        meta: {},
        file: fileTask,
        timeout: taskData.testTimeout,
        annotations: [],
      };
      fileTask.tasks.push(testTask);
    }
    debug('[Worker] Reporting', fileTask.tasks.length, 'discovered tests via rpc.onCollected()');
  }

  // Add file-level error if provided (failure case)
  if (options?.error) {
    fileTask.result = {
      state: 'fail',
      errors: [options.error instanceof Error ? options.error : new Error(String(options.error))],
    };
    debug('[Worker] Reporting file-level error via rpc.onCollected()');
  }

  // Report file task via RPC
  debug('[Worker] Calling rpc.onCollected with', fileTask.tasks.length, 'tasks');
  await rpc.onCollected([fileTask]);
  debug('[Worker] rpc.onCollected completed');

  // If this is an error case, also report via onTaskUpdate
  if (options?.error) {
    const taskPack: TaskResultPack = [fileTask.id, fileTask.result!, fileTask.meta];
    await rpc.onTaskUpdate([taskPack], []);
  }

  return fileTask;
}

/**
 * Report test result via RPC (immediate update, no batching)
 *
 * @param testTask - Test task to update
 * @param testResult - Test execution result (includes timing)
 * @param rpc - RPC methods for communication
 */
async function reportTestResult(
  testTask: RunnerTestCase,
  testResult: TestResult,
  rpc: BirpcReturn<RuntimeRPC>
): Promise<void> {
  // Update test task with result including timing from executor
  testTask.result = {
    state: testResult.passed ? 'pass' : 'fail',
    errors: testResult.error ? [testResult.error] : undefined,
    duration: testResult.duration,
    startTime: testResult.startTime,
  };

  // Create TaskResultPack and TaskEventPack for RPC reporting
  const taskPack: TaskResultPack = [testTask.id, testTask.result, testTask.meta];
  const eventPack: TaskEventPack = [testTask.id, 'test-finished', undefined];

  // Report with 'test-finished' event
  debug('[Worker] Calling rpc.onTaskUpdate for test:', testTask.name, 'duration:', testResult.duration, 'ms');
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  debug('[Worker] rpc.onTaskUpdate completed for test:', testTask.name);
}

/**
 * Collect tests (discovery only, no execution)
 *
 * Called via `pool.run(taskData, { name: 'collectTests' })`
 *
 * @param taskData - Task data from main process with MessagePort for RPC
 * @returns Discovered tests and compiled data (if cache miss)
 */
export async function collectTests(taskData: PoolToWorkerData): Promise<CollectTestsResult> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] collectTests started for:', taskData.testFile);

  // Create RPC client using the MessagePort from pool
  const rpc = createBirpc<RuntimeRPC>(
    {},  // No methods to expose from worker side
    {
      post: (v) => taskData.port.postMessage(v),
      on: (fn) => taskData.port.on('message', fn),
    }
  );
  debug('[Worker] RPC client established');

  // Get or compile binary
  const compiled = await getOrCompileBinary(taskData);

  // Discover tests
  const tests = await getOrDiscoverTests(
    compiled.binary,
    taskData.testFile,
    taskData.cachedData?.discoveredTests
  );

  debug('[Worker] collectTests complete, discovered', tests.length, 'tests');

  // Create file task and report via RPC (no execution, just discovery)
  await createAndReportFileTask(
    taskData.testFile,
    taskData,
    rpc,
    { tests }
  );

  // Return tests AND compiled data for pool to cache
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
 *
 * @param taskData - Task data from main process with MessagePort for RPC
 * @returns Compiled data (if cache miss)
 */
export async function runTests(taskData: PoolToWorkerData): Promise<RunTestsResult> {
  setDebug(taskData.options.debug ?? false);
  debug('[Worker] runTests started for:', taskData.testFile);

  // Create RPC client using the MessagePort from pool
  const rpc = createBirpc<RuntimeRPC>(
    {},  // No methods to expose from worker side
    {
      post: (v) => taskData.port.postMessage(v),
      on: (fn) => taskData.port.on('message', fn),
    }
  );
  debug('[Worker] RPC client established');

  try {
    // Get or compile binary
    const compiled = await getOrCompileBinary(taskData);
    debug('[Worker] Binary ready, fromCache:', compiled.fromCache);

    // Discover tests
    const tests = await getOrDiscoverTests(
      compiled.binary,
      taskData.testFile,
      taskData.cachedData?.discoveredTests
    );
    debug('[Worker] Discovered', tests.length, 'tests');

    // Create file task and report discovered tests via RPC
    const fileTask = await createAndReportFileTask(
      taskData.testFile,
      taskData,
      rpc,
      { tests }
    );

    // Track file execution start time
    const fileStartTime = Date.now();
    fileTask.result = {
      state: 'run',
      startTime: fileStartTime,
    };

    // Execute tests with RPC reporting
    debug('[Worker] Executing tests with RPC reporting');
    const executionResults = await executeTestsAndCollectCoverage(
      compiled.binary,
      compiled.sourceMap,
      compiled.coverageBinary,
      tests,
      taskData.testFile
    );

    // Report test results via RPC (immediate updates, no batching in Phase 3b)
    debug('[Worker] Reporting test results via rpc.onTaskUpdate()');
    for (let i = 0; i < executionResults.tests.length; i++) {
      const testResult = executionResults.tests[i]!; // Assert non-null: executeTestsAndCollectCoverage always returns results
      const testTask = fileTask.tasks[i] as RunnerTestCase;
      await reportTestResult(testTask, testResult, rpc);
    }

    // Calculate file duration and determine final state
    const fileEndTime = Date.now();
    const hasFailures = fileTask.tasks.some((task) => task.result?.state === 'fail');
    fileTask.result.duration = fileEndTime - fileStartTime;
    fileTask.result.state = hasFailures ? 'fail' : 'pass';

    // Send final file task update with 'suite-finished' event
    const fileTaskPack: TaskResultPack = [fileTask.id, fileTask.result, fileTask.meta];
    const fileEventPack: TaskEventPack = [fileTask.id, 'suite-finished', undefined];
    await rpc.onTaskUpdate([fileTaskPack], [fileEventPack]);

    debug('[Worker] runTests complete');

    // Return compiled data only if we compiled (cache miss)
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
    // Handle errors gracefully - report file-level failure to Vitest
    debug('[Worker] Error in runTests:', error);

    // Report error as failed file task via RPC
    await createAndReportFileTask(
      taskData.testFile,
      taskData,
      rpc,
      { error }
    );

    // Don't re-throw - error has been reported to Vitest
    // Return null compiledData since we didn't successfully compile/execute
    return {
      compiledData: null,
    };
  }
}
