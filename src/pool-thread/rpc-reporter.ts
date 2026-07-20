/**
 * RPC Reporting Helpers
 *
 * This module provides helper functions for reporting test lifecycle events
 * to Vitest via RPC. All helpers are designed to be composable and reusable.
 */

import type { MessagePort } from 'node:worker_threads';
import { createBirpc } from 'birpc';
import type {
  CancelReason,
  RunnerRPC,
  RuntimeRPC,
  RunnerTask,
  RunnerTaskEventPack,
  RunnerTaskResultPack,
  RunnerTestCase,
  RunnerTestFile,
  RunnerTestSuite,
  UserConsoleLog,
} from 'vitest';

import type {
  AssemblyScriptConsoleLog,
  AssemblyScriptCoveragePayload,
  AssemblyScriptSuiteTaskMeta,
  SuiteHookKey,
  SuiteHookState,
  VitestVersion,
  WASMCompilation,
  WorkerRPC
} from '../types/types.js';
import { debug } from '../util/debug.js';
import { COVERAGE_PAYLOAD_FORMATS } from '../types/constants.js';
import {
  createAfterSuiteRunMeta,
  getTaskLogLabel,
  isSuiteOwnFile
} from '../util/vitest-tasks.js';

// ============================================================================
// RPC Client Factory
// ============================================================================

/** Create RPC client from MessagePort */
export function createRpcClient(port: MessagePort): WorkerRPC {
  return createBirpc<RuntimeRPC, RunnerRPC>(
    {
      onCancel: (_reason: CancelReason) => void { }
    },
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
  rpc: WorkerRPC,
  fileTask: RunnerTestFile,
  logModule: string,
  logLabel: string,
): Promise<void> {
  await rpc.onQueued(fileTask);
  debug(`[${logModule} RPC] ${logLabel} - Reported onQueued for file "${fileTask.filepath}"`
    + ` | mode: "${fileTask.mode}" | state: "${fileTask.result ? fileTask.result.state : '--'}"`
  );
}

/** Report file collection complete with full task tree */
export async function reportFileCollected(
  rpc: WorkerRPC,
  fileTask: RunnerTestFile,
  logModule: string,
  logLabel: string,
): Promise<void> {
  await rpc.onCollected([fileTask]);
  debug(`[${logModule} RPC] ${logLabel} - Reported onCollected for file "${fileTask.filepath}"`
    + ` | ${fileTask.tasks.length} tasks | mode: "${fileTask.mode}" | state: "${fileTask.result?.state}"`
  );
}

/** Report file-level error (compilation/discovery failure) as "suite-failed-early" */
export async function reportFileError(
  rpc: WorkerRPC,
  fileTask: RunnerTestFile, 
  logModule: string,
  logLabel: string,
): Promise<void> {
  const taskPack: RunnerTaskResultPack = [fileTask.id, fileTask.result, {}];
  const eventPack: RunnerTaskEventPack = [fileTask.id, "suite-failed-early", undefined];
  await rpc.onTaskUpdate([taskPack], [eventPack]);

  debug(`[${logModule} RPC] ${logLabel} - Reported "suite-failed-early" task update for "${fileTask.filepath}"`);
}

// ============================================================================
// Suite Lifecycle Reporting
// ============================================================================

/** Report suite-prepare event */
export async function reportSuitePrepare(
  rpc: WorkerRPC,
  suite: RunnerTestSuite,
  logModule: string,
  base: string,
): Promise<void> {
  // Report suite event (without the custom task meta so reporters won't log it)
  const taskPack: RunnerTaskResultPack = [suite.id, suite.result, {}];
  const eventPack: RunnerTaskEventPack = [suite.id, 'suite-prepare', undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);

  debug(`[${logModule} RPC] ${getTaskLogLabel(base, suite)} - Reported "suite-prepare" task update`
    + ` | state: "${suite.result?.state}"`
  );
}

/** Report suite-finished event */
export async function reportSuiteFinished(
  rpc: WorkerRPC,
  suite: RunnerTestSuite,
  collectCoverage: boolean,
  compilation: WASMCompilation,
  logModule: string,
  base: string,
  vitestVersion: VitestVersion = 'v4',
): Promise<void> {
  const suiteLabel = getTaskLogLabel(base, suite);
  const rpcLogPrefix = `[${logModule} RPC] ${suiteLabel}`;
  const meta = suite.meta as AssemblyScriptSuiteTaskMeta;
  const coverageBundle = meta.coverage;
  let coveragePromise: Promise<void> = Promise.resolve();

  // Report coverage if coverage is enabled and this is a file task
  if (collectCoverage && isSuiteOwnFile(suite) && coverageBundle) {
    // The set of source files that a binary loaded is a file-level property.
    // Record it once on the file suite's bundle. The provider uses it to mark
    // module-level declarations covered for files that loaded but produce no runtime counter.
    if (compilation.debugInfo) {
      coverageBundle.loadedSourceFiles = compilation.debugInfo.absoluteDebugSourceFiles;
    }

    const coverage: AssemblyScriptCoveragePayload = {
      __format: COVERAGE_PAYLOAD_FORMATS.AssemblyScript,
      ...coverageBundle,
      suiteLogLabel: suiteLabel
    };
    
    const afterSuiteMeta = createAfterSuiteRunMeta(
      coverage,
      [suite.file.filepath],
      suite.file.projectName,
      vitestVersion
    );
    coveragePromise = rpc.onAfterSuiteRun(afterSuiteMeta);

    debug(`${rpcLogPrefix} - onAfterSuiteRun: Reported suite coverage`);
  }

  // Report suite event (without the custom task meta so reporters won't log it)
  const taskPack: RunnerTaskResultPack = [suite.id, suite.result, {}];
  const eventPack: RunnerTaskEventPack = [suite.id, "suite-finished", undefined];

  await Promise.all([
    coveragePromise,
    rpc.onTaskUpdate([taskPack], [eventPack])
  ]);

  debug(`${rpcLogPrefix} - Reported "suite-finished" task update | state: "${suite.result?.state}"`
    + ` | duration: ${suite.result?.duration?.toFixed(2) ?? '--'} ms`
  );
}

// ============================================================================
// Test Lifecycle Reporting
// ============================================================================

async function reportTestTaskUpdate(
  rpc: WorkerRPC,
  test: RunnerTestCase,
  logModule: string,
  base: string,
  updateEvent: 'test-prepare' | 'test-finished' | 'test-retried'
): Promise<void> {
  // Report test event (without the custom task meta so reporters won't log it)
  const taskPack: RunnerTaskResultPack = [test.id, test.result, {}];
  const eventPack: RunnerTaskEventPack = [test.id, updateEvent, undefined];

  debug(`[${logModule} RPC] ${getTaskLogLabel(base, test)} - Reporting "${updateEvent}" task update...`
    + ` | state: "${test.result?.state}"`
    + `${updateEvent === 'test-prepare' ? '' : ` | duration: ${test.result?.duration?.toFixed(2) ?? '--'} ms`}`
  );
  await rpc.onTaskUpdate([taskPack], [eventPack]);
  debug(`[${logModule} RPC] ${getTaskLogLabel(base, test)} - Reported "${updateEvent}" task update`
    + ` | state: "${test.result?.state}"`
    + `${updateEvent === 'test-prepare' ? '' : ` | duration: ${test.result?.duration?.toFixed(2) ?? '--'} ms`}`
  );
}

/** Report test starting execution */
export async function reportTestPrepare(
  rpc: WorkerRPC,
  test: RunnerTestCase,
  logModule: string,
  base: string,
): Promise<void> {
  return reportTestTaskUpdate(rpc, test, logModule, base, 'test-prepare');
}

/** Report test finished execution */
export async function reportTestFinished(
  rpc: WorkerRPC,
  test: RunnerTestCase,
  logModule: string,
  base: string,
): Promise<void> {
  return reportTestTaskUpdate(rpc, test, logModule, base, 'test-finished');
}

/** Report test retried (sent when test failed and is going to be retried) */
export async function reportTestRetried(
  rpc: WorkerRPC,
  test: RunnerTestCase,
  logModule: string,
  base: string,
): Promise<void> {
  return reportTestTaskUpdate(rpc, test, logModule, base, 'test-retried');
}

/**
 * vitest's hook TaskUpdateEvent names by hook kind: a `-start` event when a
 * suite level's hook group begins ('run'), a `-end` event when it completes
 * successfully ('pass'). These are the only hook events vitest's own runner
 * emits — vitest is the consumer of this stream, so its observed behavior is
 * the contract.
 */
const HOOK_UPDATE_EVENTS = {
  beforeEach: { start: 'before-hook-start', end: 'before-hook-end' },
  afterEach: { start: 'after-hook-start', end: 'after-hook-end' },
} as const satisfies Record<SuiteHookKey, { start: RunnerTaskEventPack[1]; end: RunnerTaskEventPack[1] }>;

/**
 * Report a lifecycle hook group state change (`test.result.hooks` is updated
 * by the runner before this is called; the task pack carries it).
 *
 * On 'fail', NO event is emitted — matching vitest's runner, which never sends
 * a hook event after a hook throws (an end event would read as success to a
 * consumer of the stream). Our recorded 'fail' state still reaches vitest
 * inside the result carried by subsequent task packs ('test-finished' at
 * minimum); vitest itself leaves the state stuck at 'run' in this case.
 */
export async function reportTestHookState(
  rpc: WorkerRPC,
  test: RunnerTestCase,
  hookKey: SuiteHookKey,
  state: SuiteHookState,
  logModule: string,
  base: string,
): Promise<void> {
  if (state === 'fail') {
    debug(`[${logModule} RPC] ${getTaskLogLabel(base, test)} - Recorded ${hookKey} "fail" | no hook event emitted`);
    return;
  }

  const eventName = state === 'run' ? HOOK_UPDATE_EVENTS[hookKey].start : HOOK_UPDATE_EVENTS[hookKey].end;

  // Report hook event (without the custom task meta so reporters won't log it)
  const taskPack: RunnerTaskResultPack = [test.id, test.result, {}];
  const eventPack: RunnerTaskEventPack = [test.id, eventName, undefined];

  await rpc.onTaskUpdate([taskPack], [eventPack]);

  debug(`[${logModule} RPC] ${getTaskLogLabel(base, test)} - Reported "${eventName}" task update`
    + ` | ${hookKey}: "${state}"`
  );
}

// ============================================================================
// Other Reporting
// ============================================================================

/** Report user console log messages */
export async function reportUserConsoleLogs(
  rpc: WorkerRPC,
  logs: AssemblyScriptConsoleLog[],
  logModule: string,
  base: string,
  task: RunnerTask,
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

  debug(`[${logModule} RPC] ${getTaskLogLabel(base, task)} - Reported onUserConsoleLog | ${logs.length} messages`);
}

// ============================================================================
// Final Flush
// ============================================================================

/** Flush any pending RPC updates */
export async function flushRpcUpdates(
  rpc: WorkerRPC,
): Promise<void> {
  await rpc.onTaskUpdate([], []);
}
