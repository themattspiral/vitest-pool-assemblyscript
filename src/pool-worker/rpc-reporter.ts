/**
 * RPC Reporting Helpers
 *
 * This module provides helper functions for reporting test lifecycle events
 * to Vitest via RPC. All helpers are designed to be composable and reusable.
 */

import { createBirpc, type BirpcReturn } from 'birpc';
import type { MessagePort } from 'node:worker_threads';
import type { RunMode, RuntimeRPC, UserConsoleLog } from 'vitest';
import type { RunnerTestCase, RunnerTestFile } from 'vitest/node';
import { TaskResult, TaskEventPack, TaskResultPack, TaskMeta, TaskUpdateEvent } from '@vitest/runner/types';
import { createFileTask } from '@vitest/runner/utils';

import type {
  ExecuteTestResult,
  ProjectInfo,
  DiscoveredTests,
  AssemblyScriptTestError,
  DiscoveredTest,
  AssemblyScriptConsoleLog
} from '../types/types.js';
import {
  ASSEMBLYSCRIPT_POOL_NAME
} from '../types/constants.js';
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
): RunnerTestFile {
  const fileTask = createFileTask(
    testFile,
    projectRoot,
    projectName,
    ASSEMBLYSCRIPT_POOL_NAME
  );
  fileTask.mode = 'queued';
  return fileTask;
}

function getTaskModeFromTestOptions(test: DiscoveredTest): RunMode {
  if (test.options.skip) {
    return 'skip';
  } else if (test.options.only) {
    return 'only';
  } else {
    return 'queued';
  }
}

/**
 * Create file task to represent the test suite, its timing metadata,
 * and to hold tests cases for discovered tests.
 *
 * @param testFile - Path to test file
 * @param projectInfo - Project information for file task creation
 * @param timings - Phase timings for duration metadata
 * @returns File task with test tasks and timing metadata
 */
export function createCollectedFileTaskWithTestCases(
  testFile: string,
  projectInfo: ProjectInfo,
  tests: DiscoveredTests,
  compileTiming: number,
  discoverTiming: number
): RunnerTestFile {
  const fileTask = createFileTask(
    testFile,
    projectInfo.projectRoot,
    projectInfo.projectName,
    ASSEMBLYSCRIPT_POOL_NAME
  );
  fileTask.mode = 'queued';

  // Add timing metadata
  fileTask.prepareDuration = compileTiming;
  fileTask.environmentLoad = 0;  // AS pool has no environment setup
  fileTask.setupDuration = 0;     // AS pool has no setup files
  fileTask.collectDuration = discoverTiming;
  fileTask.tasks = [];

  let allSkipped: boolean = true;

  // Add test tasks
  for (const test of Object.values(tests)) {
    const testTask: RunnerTestCase = {
      type: 'test',
      name: test.name,
      id: test.id,
      context: {} as any,
      suite: fileTask,
      mode: getTaskModeFromTestOptions(test),
      meta: {},
      file: fileTask,
      annotations: [],
      
      // set test-specific config on the test task
      timeout: test.options.timeout,
      retry: test.options.retry,
      fails: test.options.fails,
    };

    fileTask.tasks.push(testTask);

    if (testTask.mode !== 'skip') {
      allSkipped = false;
    }
  }

  if (allSkipped) {
    fileTask.mode = 'skip';
  }

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
  fileTask: RunnerTestFile
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
  fileTask: RunnerTestFile
): Promise<void> {
  rpcDebug(`[RPC] Reporting onCollected (queued with tasks) for: "${fileTask.filepath}" with ${fileTask.tasks.length} tests`);
  await rpc.onCollected([fileTask]);
  rpcDebug(`[RPC] Completed onCollected (queued with tasks) for: "${fileTask.filepath}"`);
}

/**
 * Report suite (file) starting execution
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task representing the suite
 */
export async function reportSuitePrepare(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask: RunnerTestFile
): Promise<void> {
  const taskPack: TaskResultPack = [fileTask.id, fileTask.result, fileTask.meta];
  const eventPack: TaskEventPack = [fileTask.id, 'suite-prepare', undefined];

  rpcDebug(`[RPC] Reporting "suite-prepare" (run) for: "${fileTask.filepath}"`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed "suite-prepare" (run) for: "${fileTask.filepath}"`);
}

/**
 * Report suite (file) finished execution
 *
 * @param rpc - RPC client for communication
 * @param fileTask - File task representing the suite
 */
export async function reportSuiteFinished(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask: RunnerTestFile
): Promise<void> {
  const taskPack: TaskResultPack = [fileTask.id, fileTask.result, fileTask.meta];
  const eventPack: TaskEventPack = [fileTask.id, 'suite-finished', undefined];

  rpcDebug(`[RPC] Reporting "suite-finished" for: "${fileTask.filepath}" (fileTask.id ${fileTask.id})`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed "suite-finished" for: "${fileTask.filepath}"`);
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
  testTaskId: string,
  testTaskName: string,
  testTaskMeta: TaskMeta,
  executionStart: number
): Promise<void> {
  const result: TaskResult = {
    state: 'run',
    startTime: executionStart,
    retryCount: 0
  };

  const taskPack: TaskResultPack = [testTaskId, result, testTaskMeta];
  const eventPack: TaskEventPack = [testTaskId, 'test-prepare', undefined];

  rpcDebug(`[RPC] Calling rpc.onTaskUpdate with "test-prepare" (run) on test: "${testTaskName}"`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed rpc.onTaskUpdate with "test-prepare" (run) on test: "${testTaskName}"`);
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
  test: DiscoveredTest,
  testTaskId: string,
  testTaskName: string,
  testTaskMeta: TaskMeta,
  testResult: ExecuteTestResult,
  allResultErrors: AssemblyScriptTestError[],
  retryCount?: number,
): Promise<void> {
  const result: TaskResult = {
    state: testResult.passed ? 'pass' : 'fail',
    errors: allResultErrors.length > 0 ? allResultErrors : undefined,
    duration: testResult.duration,
    startTime: testResult.startTime,
    retryCount
  };

  const taskPack: TaskResultPack = [testTaskId, result, testTaskMeta];
  
  const taskEvent: TaskUpdateEvent = !testResult.passed && retryCount !== undefined && retryCount < test.options.retry ? 'test-retried' : 'test-finished';

  const eventPack: TaskEventPack = [testTaskId, taskEvent, undefined];

  rpcDebug(`[RPC] Calling rpc.onTaskUpdate with "${taskEvent}" event on test: "${testTaskName}" | duration: ${testResult.duration}ms`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] Completed rpc.onTaskUpdate with "${taskEvent}" event on test: "${testTaskName}" | duration: ${testResult.duration}ms`);
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
  fileTask?: RunnerTestFile
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
  fileTask: RunnerTestFile,
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
