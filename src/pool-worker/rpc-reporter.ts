/**
 * RPC Reporting Helpers
 *
 * This module provides helper functions for reporting test lifecycle events
 * to Vitest via RPC. All helpers are designed to be composable and reusable.
 */

import type { MessagePort } from 'node:worker_threads';
import { basename } from 'node:path';
import { createBirpc, type BirpcReturn } from 'birpc';
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
  await rpc.onQueued(fileTask);
  rpcDebug(`[RPC] ${basename(fileTask.filepath)} - Reported onQueued for file "${fileTask.filepath}"`
    + ` | mode: "${fileTask.mode}" | state: "${fileTask.result ? fileTask.result.state : '--'}"`
  );
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
  await rpc.onCollected([fileTask]);
  rpcDebug(`[RPC] ${basename(fileTask.filepath)} - Reported onCollected for file "${fileTask.filepath}"`
    + ` | ${fileTask.tasks.length} tasks | mode: "${fileTask.mode}" | state: "${fileTask.result?.state}"`
  );
}

/**
 * Report suite-prepare event
 */
export async function reportSuitePrepare(
  rpc: BirpcReturn<RuntimeRPC, object>,
  suite: Suite,
  base: string,
  suiteLabel: string,
): Promise<void> {
  // Report suite events without the custom task meta so reporters won't log it
  const taskPack: TaskResultPack = [suite.id, suite.result, {}];
  const eventPack: TaskEventPack = [suite.id, 'suite-prepare', undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);

  rpcDebug(`[RPC] ${base} - ${suiteLabel}Reported "suite-prepare" | state: "${suite.result?.state}"`
    + ` | duration: ${suite.result?.duration?.toFixed(2) ?? '--'}ms`
  );
}


/**
 * Report suite-finished event
 */
export async function reportSuiteFinished(
  rpc: BirpcReturn<RuntimeRPC, object>,
  suite: Suite,
  base: string,
  suiteLabel: string,
): Promise<void> {
  let coveragePromise: Promise<void> = Promise.resolve();
  const meta = suite.meta as AssemblyScriptSuiteTaskMeta;

  // Report coverage if available
  if (meta.coverageData) {
    const coverage: AssemblyScriptCoveragePayload = {
      __format: COVERAGE_PAYLOAD_FORMATS.AssemblyScript,
      coverageData: meta.coverageData,
    };

    coveragePromise = rpc.onAfterSuiteRun({
      coverage,
      testFiles: [suite.file.filepath],
      transformMode: 'ssr',
      projectName: suite.file.projectName,
    });

    debug(`[RPC] ${base} - ${suiteLabel}Reported suite coverage via onAfterSuiteRun`);
  } else {
    debug(`[RPC] ${base} - ${suiteLabel}No suite coverage available to report via onAfterSuiteRun`);
  }

  // Report suite event without the custom task meta so reporters won't log it
  const taskPack: TaskResultPack = [suite.id, suite.result, {}];
  const eventPack: TaskEventPack = [suite.id, "suite-finished", undefined];

  await Promise.all([
    coveragePromise,
    rpc.onTaskUpdate([taskPack], [eventPack])
  ]);

  rpcDebug(`[RPC] ${base} - ${suiteLabel}Reported "suite-finished" | state: "${suite.result?.state}"`
    + ` | duration: ${suite.result?.duration?.toFixed(2) ?? '--'}ms`
  );
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
  const taskPack: TaskResultPack = [test.id, test.result, {}];
  const eventPack: TaskEventPack = [test.id, 'test-prepare', undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] ${basename(test.file.filepath)} - Reported "test-prepare" on "${test.name}"`
    + ` | state: "${test.result?.state}"`);
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
  const taskPack: TaskResultPack = [test.id, test.result, {}];
  const eventPack: TaskEventPack = [test.id, 'test-finished', undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] ${basename(test.file.filepath)} - Reported "test-finished" on "${test.name}"`
    + ` | state: "${test.result?.state}" | duration: ${test.result?.duration?.toFixed(2)}ms`
  );
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
  const taskPack: TaskResultPack = [test.id, test.result, {}];
  const eventPack: TaskEventPack = [test.id, 'test-retried', undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[RPC] ${basename(test.file.filepath)} - Reported "test-retried" on "${test.name}"`
    + ` | state: "${test.result?.state}" | duration: ${test.result?.duration?.toFixed(2)}ms`
  );
}

// ============================================================================
// Final Flush
// ============================================================================

/**
 * Flush any pending RPC updates
 */
export async function flushRpcUpdates(
  rpc: BirpcReturn<RuntimeRPC, object>,
): Promise<void> {
  await rpc.onTaskUpdate([], []);
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
  base: string,
  taskId: string,
  label: string,
): Promise<void> {
  if (logs.length === 0) {
    return;
  }

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

  rpcDebug(`[RPC] ${base} - Reported onUserConsoleLog for "${label}" | ${logs.length} messages`);
}

/**
 * Report file-level error (compilation/discovery failure)
 */
export async function reportFileError(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: File,
): Promise<void> {
  // await rpc.onCollected([fileTask]);

  const taskPack: TaskResultPack = [fileTask.id, fileTask.result, {}];
  const eventPack: TaskEventPack = [fileTask.id, "suite-failed-early", undefined];
  await rpc.onTaskUpdate([taskPack], [eventPack]);

  rpcDebug(`[RPC] ${basename(fileTask.filepath)} - Reported "suite-failed-early" for "${fileTask.filepath}"`);

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
