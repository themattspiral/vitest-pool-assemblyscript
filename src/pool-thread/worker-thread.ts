/**
 * Worker entry point - Node Worker (vitest v4)
 */
import { parentPort, threadId, workerData } from 'node:worker_threads';
import { init } from 'vitest/worker';
import type { WorkerGlobalState } from 'vitest';
import type { WorkerRequest } from 'vitest/node';
import type { FileSpecification } from '@vitest/runner/types';

import { runFile } from './runner.js';
import { debug, setDebugMode } from '../util/debug.js';
import { createInitialFileTask } from '../util/vitest-tasks.js';
import type { WorkerThreadInitData, WorkerThreadResumeContext } from '../types/types.js';

const { asPoolOptions, asCoverageOptions } = workerData as WorkerThreadInitData;
const logModule = `WorkerThread` as const;
let workerId: number | undefined;

function logModuleWithId() {
  return `${logModule}${workerId === undefined ? '' : ` ${workerId}`}`;
}

setDebugMode(asPoolOptions.debug);
debug(`[${logModule}] Worker thread started | Thread ID: ${threadId}`);

// registered before init() in case we want to withhold messages
parentPort!.on('message', async (message) => {
  if (message?.__vitest_worker_request__ && message.type === 'start') {
    workerId = (message as WorkerRequest & { type: 'start' }).workerId;
    debug(`[${logModuleWithId()}] Got START from PoolWorker`);
  } else if (message?.__vitest_worker_request__ && message.type === 'stop') {
    debug(`[${logModuleWithId()}] Got STOP from PoolWorker`);
  }

  // no return - vitest messages fall through to init()
});

async function run(state: WorkerGlobalState, isCollectTestsMode: boolean): Promise<void> {
  workerId = state.ctx.workerId;
  const mode = isCollectTestsMode ? 'collectTests' : 'runTests';

  const { timedOutTest, timedOutCompilation } = state.providedContext as WorkerThreadResumeContext;

  debug(`[${logModuleWithId()}] -------- ${mode} starting --------`);
  debug(`[${logModuleWithId()}] projectName: "${state.ctx.projectName}"`
    + ` | files: "${state.ctx.files.map(f => f.filepath).join(',')}"`
  );

  const fileRuns: Promise<void>[] = state.ctx.files.map(async (fileSpec: FileSpecification): Promise<void> => {
    const file = timedOutTest ? timedOutTest.file : createInitialFileTask(
      fileSpec.filepath,
      state.ctx.projectName,
      state.config.root,
      state.config.testTimeout,
      state.config.retry
    );

    return runFile(
      file,
      logModuleWithId(),
      state.rpc,
      parentPort!,
      isCollectTestsMode,
      asPoolOptions,
      state.config.root,
      state.config.coverage.enabled,
      asCoverageOptions.globbedAssemblyScriptProjectRelativeExcludeOnly ?? [],
      state.config.bail,
      typeof state.config.diff === 'object' ? state.config.diff : undefined,
      state.config.testNamePattern,
      state.config.allowOnly,
      timedOutTest,
      timedOutCompilation
    );
  });

    debug(`[${logModuleWithId()}] ${mode} awaiting ${fileRuns.length} file runs`);

    await Promise.all(fileRuns);

    debug(`[${logModuleWithId()}] -------- ${mode} completed ${fileRuns.length} file runs --------`);
}

init({
  post: (msg) => parentPort!.postMessage(msg),
  on: (cb) => parentPort!.on('message', cb),
  off: (cb) => parentPort!.off('message', cb),
  runTests: async (state: WorkerGlobalState) => run(state, false),
  collectTests: async (state) => run(state, true),
  teardown: async () => {
    parentPort!.removeAllListeners('message');
    debug(`[${logModuleWithId()}] teardown complete`);
  },
});
