/**
 * RPC Reporting Helpers
 *
 * This module provides helper functions for reporting test lifecycle events
 * to Vitest via RPC. All helpers are designed to be composable and reusable.
 */

import { createBirpc, type BirpcReturn } from 'birpc';
import type { MessagePort } from 'node:worker_threads';
import type { RuntimeRPC, UserConsoleLog } from 'vitest';
import type {
  File,
  Suite,
  Test,
  TaskEventPack,
  TaskResultPack,
} from '@vitest/runner/types';
import { createFileTask } from '@vitest/runner/utils';

import type { AssemblyScriptConsoleLog } from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_NAME } from '../types/constants.js';
import { debug } from '../util/debug.js';

const DEBUG_RPC = false;

function rpcDebug(...args: any[]): void {
  if (DEBUG_RPC) {
    debug(...args);
  }
};

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
 * @param projectInfo - Project information for file task creation
 * @returns File task with mode set to 'queued'
 */
export function createInitialFileTask(
  testFile: string,
  projectRoot: string,
  projectName: string
): File {
  const fileTask = createFileTask(
    testFile,
    projectRoot,
    projectName,
    ASSEMBLYSCRIPT_POOL_NAME
  );

  fileTask.mode = 'queued';
  fileTask.environmentLoad = 0;  // AS pool has no environment setup
  fileTask.setupDuration = 0;    // AS pool has no setup files

  return fileTask;
}

// ============================================================================
// File Task Reporting
// ============================================================================

/**
 * Report file as queued (before collection starts)
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task to report
 */
export async function reportFileQueued(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask: File
): Promise<void> {
  rpcDebug(`[RPC] Reporting onQueued for: "${fileTask.filepath}"`);
  await rpc.onQueued(fileTask);
  rpcDebug(`[RPC] Completed onQueued for: "${fileTask.filepath}"`);
  
}

/**
 * Report file collection complete with full task tree
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task with complete test tree
 */
export async function reportFileCollected(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask: File
): Promise<void> {
  rpcDebug(`[RPC] Reporting onCollected (queued with tasks) for: "${fileTask.filepath}" with ${fileTask.tasks.length} tasks`);
  await rpc.onCollected([fileTask]);
  rpcDebug(`[RPC] Completed onCollected (queued with tasks) for: "${fileTask.filepath}"`);
}

/**
 * Report suite starting execution
 *
 * @param rpc - RPC client for communication
 * @param suiteTask - Task representing the suite
 */
export async function reportSuitePrepare(
  rpc: BirpcReturn<RuntimeRPC, object>,
  suiteTask: Suite
): Promise<void> {
  const taskPack: TaskResultPack = [suiteTask.id, suiteTask.result, suiteTask.meta];
  const eventPack: TaskEventPack = [suiteTask.id, 'suite-prepare', undefined];

  rpcDebug(`[RPC] Reporting "suite-prepare" (state: "${suiteTask.result?.state}") for: "${suiteTask.name}"`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed "suite-prepare" (state: "${suiteTask.result?.state}") for: "${suiteTask.name}"`);
}

/**
 * Report suite (file) finished execution
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task representing the suite
 */
export async function reportSuiteFinished(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask: File
): Promise<void> {
  const taskPack: TaskResultPack = [fileTask.id, fileTask.result, fileTask.meta];
  const eventPack: TaskEventPack = [fileTask.id, 'suite-finished', undefined];

  rpcDebug(`[RPC] Reporting "suite-finished" (state: "${fileTask.result?.state}") for: "${fileTask.filepath}" (fileTask.id ${fileTask.id})`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed "suite-finished" (state: "${fileTask.result?.state}") for: "${fileTask.filepath}"`);
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
  test: Test,
): Promise<void> {
  const taskPack: TaskResultPack = [test.id, test.result, test.meta];
  const eventPack: TaskEventPack = [test.id, 'test-prepare', undefined];

  rpcDebug(`[RPC] Calling rpc.onTaskUpdate with "test-prepare" (state: ${test.result?.state}) on test: "${test.name}"`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed rpc.onTaskUpdate with "test-prepare" (state: ${test.result?.state}) on test: "${test.name}"`);
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
  test: Test,
): Promise<void> {
  const taskPack: TaskResultPack = [test.id, test.result, test.meta];
  const eventPack: TaskEventPack = [test.id, 'test-finished', undefined];

  rpcDebug(`[RPC] Calling rpc.onTaskUpdate with "test-finished" event on test: "${test.name}" | duration: ${test.result?.duration}ms`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed rpc.onTaskUpdate with "test-finished" event on test: "${test.name}" | duration: ${test.result?.duration}ms`);
}

/**
 * Report test retried (sent when test failed and is being retried)
 *
 * @param rpc - RPC client for communication
 * @param testTask - Test task to report
 * @param testResult - Test execution result
 */
export async function reportTestRetried(
  rpc: BirpcReturn<RuntimeRPC>,
  test: Test,
): Promise<void> {
  const taskPack: TaskResultPack = [test.id, test.result, test.meta];
  const eventPack: TaskEventPack = [test.id, 'test-retried', undefined];

  rpcDebug(`[RPC] Calling rpc.onTaskUpdate with "test-retried" event on test: "${test.name}" | duration: ${test.result?.duration}ms`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed rpc.onTaskUpdate with "test-retried" event on test: "${test.name}" | duration: ${test.result?.duration}ms`);
}

// ============================================================================
// Final Flush
// ============================================================================

/**
 * Flush any pending RPC updates (matches vmThreads pattern)
 *
 * @param rpc - RPC client for communication
 * @param fileTask - Optional file task for detailed logging
 */
export async function flushRpcUpdates(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask?: File
): Promise<void> {
  const context = fileTask ? ` for: ${fileTask.filepath}` : '';
  rpcDebug('[RPC] Sending final flush' + context);
  await rpc.onTaskUpdate([], []);
  rpcDebug('[RPC] Final flush completed' + context);
}

// ============================================================================
// Other Reporting
// ============================================================================

/**
 * Report user console log message(s)
 */
export async function reportUserConsoleLogs(
  rpc: BirpcReturn<RuntimeRPC>,
  logs: AssemblyScriptConsoleLog[],
  taskId: string,
  label: string,
): Promise<void> {
  if (logs.length === 0) {
    return;
  }

  rpcDebug(`[RPC] Reporting rpc.onUserConsoleLog for "${label}"`);
  
  const stdLogs = logs.filter(l => !l.isError);
  const errorLogs = logs.filter(l => l.isError);

  const stdContent: string = stdLogs.map(l => `${l.msg}`).join('\n');
  const errorContent: string = errorLogs.filter(l => l.isError).map(l => `${l.msg}`).join('\n');

  const stdLog: UserConsoleLog = {
    content: `${stdContent}\n`,
    size: stdContent.length,
    browser: false,
    type: 'stdout',
    time: stdLogs.length > 0 ? stdLogs[0]!.time : Date.now(),
    taskId: taskId,
    origin: taskId
  };
  
  const errorLog: UserConsoleLog = {
    content: `${errorContent}\n`,
    size: errorContent.length,
    browser: false,
    type: 'stderr',
    time: errorLogs.length > 0 ? errorLogs[0]!.time : Date.now(),
    taskId: taskId,
    origin: taskId
  };

  const reportPromises: Promise<void>[] = [];
  if (stdContent.length > 0) {
    reportPromises.push(rpc.onUserConsoleLog(stdLog));
  }
  if (errorContent.length > 0) {
    reportPromises.push(rpc.onUserConsoleLog(errorLog));
  }

  await Promise.all(reportPromises);

  rpcDebug(`[RPC] Completed reporting rpc.onUserConsoleLog for "${label}"`);
}

/**
 * Report file-level error (compilation/discovery failure)
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task to report error for
 * @param error - Error that occurred
 */
export async function reportFileError(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: File,
): Promise<void> {
  rpcDebug('[RPC] Reporting file-level error via rpc.onCollected');
  await rpc.onCollected([fileTask]);

  const taskPack: TaskResultPack = [fileTask.id, fileTask.result, fileTask.meta];
  await rpc.onTaskUpdate([taskPack], []);
  rpcDebug('[RPC] Completed reporting file-level error via rpc.onCollected');

}

// ============================================================================
// Hook Lifecycle Reporting (Not Yet Implemented)
// ============================================================================

/**
 * Report beforeAll hook starting
 * Not yet implemented - placeholder for future hook support
 */
export async function reportBeforeAllHookStart(
  _rpc: BirpcReturn<RuntimeRPC>,
  _fileTaskId: string,
  hookName: string
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report before-hook-start for beforeAll:', hookName);
}

/**
 * Report beforeAll hook finished
 * Not yet implemented - placeholder for future hook support
 */
export async function reportBeforeAllHookEnd(
  _rpc: BirpcReturn<RuntimeRPC>,
  _fileTaskId: string,
  hookName: string,
  state: 'pass' | 'fail'
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report before-hook-end for beforeAll:', hookName, state);
}

/**
 * Report afterAll hook starting
 * Not yet implemented - placeholder for future hook support
 */
export async function reportAfterAllHookStart(
  _rpc: BirpcReturn<RuntimeRPC>,
  _fileTaskId: string,
  hookName: string
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report after-hook-start for afterAll:', hookName);
}

/**
 * Report afterAll hook finished
 * Not yet implemented - placeholder for future hook support
 */
export async function reportAfterAllHookEnd(
  _rpc: BirpcReturn<RuntimeRPC>,
  _fileTaskId: string,
  hookName: string,
  state: 'pass' | 'fail'
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report after-hook-end for afterAll:', hookName, state);
}

/**
 * Report beforeEach hook starting
 * Not yet implemented - placeholder for future hook support
 */
export async function reportBeforeEachHookStart(
  _rpc: BirpcReturn<RuntimeRPC>,
  _testTaskId: string,
  hookName: string
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report before-hook-start for beforeEach:', hookName);
}

/**
 * Report beforeEach hook finished
 * Not yet implemented - placeholder for future hook support
 */
export async function reportBeforeEachHookEnd(
  _rpc: BirpcReturn<RuntimeRPC>,
  _testTaskId: string,
  hookName: string,
  state: 'pass' | 'fail'
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report before-hook-end for beforeEach:', hookName, state);
}

/**
 * Report afterEach hook starting
 * Not yet implemented - placeholder for future hook support
 */
export async function reportAfterEachHookStart(
  _rpc: BirpcReturn<RuntimeRPC>,
  _testTaskId: string,
  hookName: string
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report after-hook-start for afterEach:', hookName);
}

/**
 * Report afterEach hook finished
 * Not yet implemented - placeholder for future hook support
 */
export async function reportAfterEachHookEnd(
  _rpc: BirpcReturn<RuntimeRPC>,
  _testTaskId: string,
  hookName: string,
  state: 'pass' | 'fail'
): Promise<void> {
  rpcDebug('[RPC] [Not Implemented] Would report after-hook-end for afterEach:', hookName, state);
}
