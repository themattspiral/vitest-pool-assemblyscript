/**
 * RPC Reporting Helpers
 *
 * This module provides helper functions for reporting test lifecycle events
 * to Vitest via RPC. All helpers are designed to be composable and reusable.
 */

import { createBirpc, type BirpcReturn } from 'birpc';
import type { MessagePort } from 'node:worker_threads';
import type { RuntimeRPC } from 'vitest';
import type { RunnerTestCase, RunnerTestFile } from 'vitest/node';
import type { TaskEventPack, TaskResultPack } from '@vitest/runner';
import { createFileTask } from '@vitest/runner/utils';
import type { PhaseTimings, DiscoveredTest, TestResult, PoolToWorkerData } from '../types.js';
import { POOL_NAME } from '../types.js';
import { debug } from '../utils/debug.mjs';

// ============================================================================
// Timing Tracker
// ============================================================================

/**
 * Create phase timings tracker for duration metadata
 */
export function createPhaseTimings(): PhaseTimings {
  return {
    workerStart: Date.now(),
    compileEnd: 0,
    discoverEnd: 0,
  };
}

// ============================================================================
// RPC Client Factory
// ============================================================================

/**
 * Create RPC client from MessagePort
 *
 * @param port - MessagePort for worker communication
 * @returns Configured RPC client for RuntimeRPC methods
 */
export function createRpcClient(port: MessagePort): BirpcReturn<RuntimeRPC> {
  return createBirpc<RuntimeRPC>(
    {},
    {
      post: (v) => port.postMessage(v),
      on: (fn) => port.on('message', fn),
    }
  );
}

// ============================================================================
// File Task Creation Helpers
// ============================================================================

/**
 * Create initial file task (for onQueued)
 *
 * @param testFile - Path to test file
 * @param taskData - Task data from pool with project info
 * @returns File task with mode set to 'queued'
 */
export function createInitialFileTask(
  testFile: string,
  taskData: PoolToWorkerData
): RunnerTestFile {
  const fileTask = createFileTask(
    testFile,
    taskData.projectRoot,
    taskData.projectName,
    POOL_NAME
  );
  fileTask.mode = 'queued';
  return fileTask;
}

/**
 * Create complete file task with tests and timing metadata
 *
 * @param testFile - Path to test file
 * @param taskData - Task data from pool with project info
 * @param tests - Discovered tests to add as test tasks
 * @param timings - Phase timings for duration metadata
 * @returns File task with test tasks and timing metadata
 */
export function createFileTaskWithTests(
  testFile: string,
  taskData: PoolToWorkerData,
  tests: DiscoveredTest[],
  timings: PhaseTimings
): RunnerTestFile {
  const fileTask = createFileTask(
    testFile,
    taskData.projectRoot,
    taskData.projectName,
    POOL_NAME
  );
  fileTask.mode = 'run';

  // Add timing metadata
  fileTask.prepareDuration = timings.compileEnd - timings.workerStart;
  fileTask.environmentLoad = 0;  // AS pool has no environment setup
  fileTask.setupDuration = 0;     // AS pool has no setup files
  fileTask.collectDuration = timings.discoverEnd - timings.compileEnd;

  // Add test tasks
  for (const test of tests) {
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

  return fileTask;
}

// ============================================================================
// File Task Reporting (Fine-Grained)
// ============================================================================

/**
 * Report file as queued (before collection starts)
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task to report
 */
export async function reportFileQueued(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: RunnerTestFile
): Promise<void> {
  debug('[Worker] Calling rpc.onQueued()');
  await rpc.onQueued(fileTask);
  debug('[Worker] rpc.onQueued completed');
}

/**
 * Report file collection complete with full task tree
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task with complete test tree
 */
export async function reportFileCollected(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: RunnerTestFile
): Promise<void> {
  debug('[Worker] Calling rpc.onCollected with', fileTask.tasks.length, 'tasks');
  await rpc.onCollected([fileTask]);
  debug('[Worker] rpc.onCollected completed');
}

/**
 * Report suite (file) starting execution
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task representing the suite
 */
export async function reportSuitePrepare(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: RunnerTestFile
): Promise<void> {
  const taskPack: TaskResultPack = [fileTask.id, fileTask.result!, fileTask.meta];
  const eventPack: TaskEventPack = [fileTask.id, 'suite-prepare', undefined];

  debug('[Worker] Calling rpc.onTaskUpdate for suite-prepare');
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  debug('[Worker] rpc.onTaskUpdate completed for suite-prepare');
}

/**
 * Report suite (file) finished execution
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task representing the suite
 */
export async function reportSuiteFinished(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: RunnerTestFile
): Promise<void> {
  const taskPack: TaskResultPack = [fileTask.id, fileTask.result!, fileTask.meta];
  const eventPack: TaskEventPack = [fileTask.id, 'suite-finished', undefined];

  debug('[Worker] Calling rpc.onTaskUpdate for suite-finished');
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  debug('[Worker] rpc.onTaskUpdate completed for suite-finished');
}

// ============================================================================
// Test Lifecycle Reporting
// ============================================================================

/**
 * Report test starting execution
 *
 * @param rpc - RPC client for communication
 * @param testTask - Test task to report
 */
export async function reportTestPrepare(
  rpc: BirpcReturn<RuntimeRPC>,
  testTask: RunnerTestCase
): Promise<void> {
  testTask.result = {
    state: 'run',
    startTime: Date.now(),
  };

  const taskPack: TaskResultPack = [testTask.id, testTask.result, testTask.meta];
  const eventPack: TaskEventPack = [testTask.id, 'test-prepare', undefined];

  debug('[Worker] Calling rpc.onTaskUpdate for test-prepare:', testTask.name);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
}

/**
 * Report test finished execution
 *
 * @param rpc - RPC client for communication
 * @param testTask - Test task to report
 * @param testResult - Test execution result
 */
export async function reportTestFinished(
  rpc: BirpcReturn<RuntimeRPC>,
  testTask: RunnerTestCase,
  testResult: TestResult
): Promise<void> {
  testTask.result = {
    state: testResult.passed ? 'pass' : 'fail',
    errors: testResult.error ? [testResult.error] : undefined,
    duration: testResult.duration,
    startTime: testResult.startTime,
  };

  const taskPack: TaskResultPack = [testTask.id, testTask.result, testTask.meta];
  const eventPack: TaskEventPack = [testTask.id, 'test-finished', undefined];

  debug('[Worker] Calling rpc.onTaskUpdate for test-finished:', testTask.name, 'duration:', testResult.duration);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
}

// ============================================================================
// Final Flush
// ============================================================================

/**
 * Flush any pending RPC updates (matches vmThreads pattern)
 *
 * @param rpc - RPC client for communication
 */
export async function flushRpcUpdates(
  rpc: BirpcReturn<RuntimeRPC>
): Promise<void> {
  debug('[Worker] Sending final flush');
  await rpc.onTaskUpdate([], []);
  debug('[Worker] Final flush completed');
}

// ============================================================================
// Error Reporting
// ============================================================================

/**
 * Report file-level error (compilation/discovery failure)
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task to report error for
 * @param error - Error that occurred
 */
export async function reportFileError(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: RunnerTestFile,
  error: unknown
): Promise<void> {
  fileTask.result = {
    state: 'fail',
    errors: [error instanceof Error ? error : new Error(String(error))],
  };

  debug('[Worker] Reporting file-level error via rpc.onCollected()');
  await rpc.onCollected([fileTask]);

  const taskPack: TaskResultPack = [fileTask.id, fileTask.result, fileTask.meta];
  await rpc.onTaskUpdate([taskPack], []);
}

// ============================================================================
// TODO [Phase 2 - Hooks]: Hook Lifecycle Reporting
// ============================================================================
// When hooks are implemented, add these helper functions:
//
// export async function reportHookStart(
//   task: RunnerTestFile | RunnerTestCase,
//   hookName: 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll',
//   rpc: BirpcReturn<RuntimeRPC>
// ): Promise<void>
//
// export async function reportHookEnd(
//   task: RunnerTestFile | RunnerTestCase,
//   hookName: string,
//   state: 'pass' | 'fail',
//   rpc: BirpcReturn<RuntimeRPC>
// ): Promise<void>
//
// Reference: .claude/analysis/assemblyscript_pool_rpc_gaps.md section 6
// ============================================================================
