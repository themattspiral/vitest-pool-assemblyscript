/**
 * Worker entry point - Node Worker (vitest v4)
 */
import { basename } from 'node:path';
import { threadId, workerData } from 'node:worker_threads';
import { highlight } from '@vitest/utils/highlight';

import type { RunTestsTask, WorkerThreadInitData } from '../types/types.js';
import { debug, setGlobalDebugMode } from '../util/debug.js';
import { createRpcClient } from './rpc-reporter.js';
import { runSuite } from './runner/test-runner.js';

const logModule = `WorkerThread` as const;
const [_unused, initData] = workerData;
const { asPoolOptions } = initData as WorkerThreadInitData;

setGlobalDebugMode(asPoolOptions.debug);
debug(`[${logModule}] New test run pool thread created`);

export async function runFileSpec(data: RunTestsTask): Promise<void> {
  const {
    dispatchStart, workerId, file, port, config,
    isCollectTestsMode, compilation, timedOutTest
  } = data;

  const dispatchToInit = Date.now() - dispatchStart;
  const logModuleWithId = `${logModule} ${workerId} (t ${threadId})`;
  
  const rpc = createRpcClient(port);
  port.unref();

  const mode = isCollectTestsMode ? 'collectTests' : 'runTests';

  debug(`[${logModuleWithId}] -------- ${mode} starting -------- | dispatchToInit: ${dispatchToInit.toFixed(2)}ms`);
  debug(`[${logModuleWithId}] projectName: "${config.name}" | file: "${file.filepath}"`);

  debug(`[${logModuleWithId}] ${mode} | awaiting file run`);

  await runSuite(
    rpc,
    port,
    basename(file.filepath),
    config.coverage.enabled,
    compilation,
    file,
    logModuleWithId,
    asPoolOptions,
    highlight,
    'v4',
    config.bail,
    typeof config.diff === 'object' ? config.diff : undefined,
    timedOutTest,
  );

  debug(`[${logModuleWithId}] -------- ${mode} completed file run --------`);

  port.close();

  return;
}
