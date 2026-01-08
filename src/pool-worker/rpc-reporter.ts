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

import type {
  AssemblyScriptConsoleLog,
  AssemblyScriptCoveragePayload,
  AssemblyScriptSuiteTaskMeta
} from '../types/types.js';
import { debug, isDebugModeEnabled } from '../util/debug.js';
import { COVERAGE_PAYLOAD_FORMATS } from '../types/constants.js';

// const DEBUG_RPC = false;
const DEBUG_RPC = isDebugModeEnabled();

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
  rpcDebug(`[RPC] Reporting onCollected (${fileTask.tasks.length} tasks | mode: "${fileTask.mode}") for: "${fileTask.filepath}"`);
  await rpc.onCollected([fileTask]);
  rpcDebug(`[RPC] Completed onCollected (${fileTask.tasks.length} tasks | mode: "${fileTask.mode}") for: "${fileTask.filepath}"`);
}

/**
 * Report suite event
 *
 * @param rpc - RPC client for communication
 * @param suite - Task representing the suite
 */
export async function reportSuiteLifecycleEvent(
  rpc: BirpcReturn<RuntimeRPC, object>,
  suite: Suite,
  event: 'suite-prepare' | 'suite-finished',
  base: string,
  suiteLabel: string,
): Promise<void> {
  if (event === 'suite-finished') {
    const meta = suite.meta as AssemblyScriptSuiteTaskMeta;

    // Report coverage if available
    if (meta.coverageData) {
      debug(`[RPC] ${base} - ${suiteLabel}Reporting coverage via onAfterSuiteRun`);

      const coverage: AssemblyScriptCoveragePayload = {
        __format: COVERAGE_PAYLOAD_FORMATS.AssemblyScript,
        coverageData: meta.coverageData,
      };
      await rpc.onAfterSuiteRun({
        coverage,
        testFiles: [suite.file.filepath],
        transformMode: 'ssr',
        projectName: suite.file.projectName,
      });
    } else {
      debug(`[RPC] ${base} - ${suiteLabel}No coverage available to report via onAfterSuiteRun`);
    }
  }

  // Report suite events without the custom task meta so reporters won't log it
  const taskPack: TaskResultPack = [suite.id, suite.result, {}];
  const eventPack: TaskEventPack = [suite.id, event, undefined];

  debug(`[RPC] ${base} - ${suiteLabel}Reporting "${event}" with result: "${suite.result?.state}" (${suite.result?.duration ?? '-'}ms)`);
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] ${base} - ${suiteLabel}Completed "${event}" with result: "${suite.result?.state}" (${suite.result?.duration ?? '-'}ms)`);
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
