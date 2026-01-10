/**
 * RPC Reporting Helpers
 *
 * This module provides helper functions for reporting test lifecycle events
 * to Vitest via RPC. All helpers are designed to be composable and reusable.
 */

import type { MessagePort } from 'node:worker_threads';
import { createBirpc, type BirpcReturn } from 'birpc';
import type { RuntimeRPC, UserConsoleLog } from 'vitest';
import type {
  File,
  Suite,
  Test,
  Task,
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
import { getTaskLogLabel, isSuiteOwnFile } from '../util/vitest-tasks.js';

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

/** Create RPC client from MessagePort */
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

/** Report file as queued (before compilation & discovery starts) */
export async function reportFileQueued(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask: File,
  logModule: string,
  logLabel: string,
): Promise<void> {
  await rpc.onQueued(fileTask);
  rpcDebug(`[${logModule} RPC] ${logLabel} - Reported onQueued for file "${fileTask.filepath}"`
    + ` | mode: "${fileTask.mode}" | state: "${fileTask.result ? fileTask.result.state : '--'}"`
  );
}

/** Report file collection complete with full task tree */
export async function reportFileCollected(
  rpc: BirpcReturn<RuntimeRPC, object>,
  fileTask: File,
  logModule: string,
  logLabel: string,
): Promise<void> {
  await rpc.onCollected([fileTask]);
  rpcDebug(`[${logModule} RPC] ${logLabel} - Reported onCollected for file "${fileTask.filepath}"`
    + ` | ${fileTask.tasks.length} tasks | mode: "${fileTask.mode}" | state: "${fileTask.result?.state}"`
  );
}

/** Report file-level error (compilation/discovery failure) as "suite-failed-early" */
export async function reportFileError(
  rpc: BirpcReturn<RuntimeRPC>,
  fileTask: File, 
  logModule: string,
  logLabel: string,
): Promise<void> {
  const taskPack: TaskResultPack = [fileTask.id, fileTask.result, {}];
  const eventPack: TaskEventPack = [fileTask.id, "suite-failed-early", undefined];
  await rpc.onTaskUpdate([taskPack], [eventPack]);

  rpcDebug(`[${logModule} RPC] ${logLabel} - Reported "suite-failed-early" task update for "${fileTask.filepath}"`);
}

// ============================================================================
// Suite Lifecycle Reporting
// ============================================================================

/** Report suite-prepare event */
export async function reportSuitePrepare(
  rpc: BirpcReturn<RuntimeRPC, object>,
  suite: Suite,
  logModule: string,
  base: string,
): Promise<void> {
  // Report suite event (without the custom task meta so reporters won't log it)
  const taskPack: TaskResultPack = [suite.id, suite.result, {}];
  const eventPack: TaskEventPack = [suite.id, 'suite-prepare', undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);

  rpcDebug(`[${logModule} RPC] ${getTaskLogLabel(base, suite)} - Reported "suite-prepare" task update`
    + ` | state: "${suite.result?.state}" | duration: ${suite.result?.duration?.toFixed(2) ?? '--'}ms`
  );
}

/** Report suite-finished event */
export async function reportSuiteFinished(
  rpc: BirpcReturn<RuntimeRPC, object>,
  suite: Suite,
  logModule: string,
  base: string,
): Promise<void> {
  const suiteLabel = getTaskLogLabel(base, suite);
  const rpcLogPrefix = `[${logModule} RPC] ${suiteLabel}`;
  const meta = suite.meta as AssemblyScriptSuiteTaskMeta;
  const coverageKeys: number = Object.keys(meta.coverageData?.hitCountsByFileAndPosition ?? {}).length;
  let coveragePromise: Promise<void> = Promise.resolve();
  
  // Report coverage if this is a file task, and coverage is available
  if (isSuiteOwnFile(suite) && coverageKeys > 0) {
    const coverage: AssemblyScriptCoveragePayload = {
      __format: COVERAGE_PAYLOAD_FORMATS.AssemblyScript,
      coverageData: meta.coverageData!,
      suiteLogLabel: suiteLabel
    };

    coveragePromise = rpc.onAfterSuiteRun({
      coverage,
      testFiles: [suite.file.filepath],
      transformMode: 'ssr',
      projectName: suite.file.projectName,
    });

    debug(`${rpcLogPrefix} - onAfterSuiteRun: Reported suite coverage (${coverageKeys} unique positions)`);
  } else if (coverageKeys === 0) {
    debug(`${rpcLogPrefix} - onAfterSuiteRun: No suite coverage to report`);
  }

  // Report suite event (without the custom task meta so reporters won't log it)
  const taskPack: TaskResultPack = [suite.id, suite.result, {}];
  const eventPack: TaskEventPack = [suite.id, "suite-finished", undefined];

  await Promise.all([
    coveragePromise,
    rpc.onTaskUpdate([taskPack], [eventPack])
  ]);

  rpcDebug(`${rpcLogPrefix} - Reported "suite-finished" task update | state: "${suite.result?.state}"`
    + ` | duration: ${suite.result?.duration?.toFixed(2) ?? '--'}ms`
  );
}

// ============================================================================
// Test Lifecycle Reporting
// ============================================================================

async function reportTestTaskUpdate(
  rpc: BirpcReturn<RuntimeRPC>,
  test: Test,
  logModule: string,
  base: string,
  updateEvent: 'test-prepare' | 'test-finished' | 'test-retried'
): Promise<void> {
  // Report test event (without the custom task meta so reporters won't log it)
  const taskPack: TaskResultPack = [test.id, test.result, {}];
  const eventPack: TaskEventPack = [test.id, updateEvent, undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);
  rpcDebug(`[${logModule} RPC] ${getTaskLogLabel(base, test)} - Reported "${updateEvent}" task update`
    + ` | state: "${test.result?.state}"`);
}

/** Report test starting execution */
export async function reportTestPrepare(
  rpc: BirpcReturn<RuntimeRPC>,
  test: Test,
  logModule: string,
  base: string,
): Promise<void> {
  return reportTestTaskUpdate(rpc, test, logModule, base, 'test-prepare');
}

/** Report test finished execution */
export async function reportTestFinished(
  rpc: BirpcReturn<RuntimeRPC>,
  test: Test,
  logModule: string,
  base: string,
): Promise<void> {
  return reportTestTaskUpdate(rpc, test, logModule, base, 'test-finished');
}

/** Report test retried (sent when test failed and is going to be retried) */
export async function reportTestRetried(
  rpc: BirpcReturn<RuntimeRPC>,
  test: Test,
  logModule: string,
  base: string,
): Promise<void> {
  return reportTestTaskUpdate(rpc, test, logModule, base, 'test-retried');
}

// ============================================================================
// Other Reporting
// ============================================================================

/** Report user console log messages */
export async function reportUserConsoleLogs(
  rpc: BirpcReturn<RuntimeRPC>,
  logs: AssemblyScriptConsoleLog[],
  logModule: string,
  base: string,
  task: Task,
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
    taskId: task.id,
    origin: task.id
  };
  
  const errorLog: UserConsoleLog = {
    content: `${errorContent}\n`,
    size: errorContent.length,
    browser: false,
    type: 'stderr',
    time: errorLogs.length > 0 ? errorLogs[0]!.time : Date.now(),
    taskId: task.id,
    origin: task.id
  };

  const reportPromises: Promise<void>[] = [];
  if (stdContent.length > 0) {
    reportPromises.push(rpc.onUserConsoleLog(stdLog));
  }
  if (errorContent.length > 0) {
    reportPromises.push(rpc.onUserConsoleLog(errorLog));
  }

  await Promise.all(reportPromises);

  rpcDebug(`[${logModule} RPC] ${getTaskLogLabel(base, task)} - Reported onUserConsoleLog | ${logs.length} messages`);
}

// ============================================================================
// Final Flush
// ============================================================================

/** Flush any pending RPC updates */
export async function flushRpcUpdates(
  rpc: BirpcReturn<RuntimeRPC, object>,
): Promise<void> {
  await rpc.onTaskUpdate([], []);
}
