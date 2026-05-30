/**
 * Worker entry point - Node Worker (vitest v4)
 */
import { basename } from 'node:path';
import { threadId } from 'node:worker_threads';

import type {
  RunTestsTask,
  ThreadImports,
  WasmImportsFactory
} from '../types/types.js';
import { debug, setGlobalDebugMode } from '../util/debug.js';
import { createRpcClient, flushRpcUpdates, reportFileError } from './rpc-reporter.js';
import { runSuite } from './runner/test-runner.js';
import { loadUserWasmImportsFactory } from './load-user-imports.js';
import { isNodeVersionSupportedForCoverage } from '../util/feature-check.js';
import { failFile } from '../util/vitest-file-tasks.js';
import { buildEnhancedFileError } from '../util/pool-errors.js';

const logModule = `WorkerThread` as const;
const COVERAGE_SUPPORTED = isNodeVersionSupportedForCoverage();

export async function runFileSpec(data: RunTestsTask): Promise<void> {
  const {
    dispatchStart, workerId, file, port, config, asPoolOptions,
    isCollectTestsMode, compilation, timedOutTest
  } = data;
  const initPerf = performance.now();
  const dispatchToInit = Date.now() - dispatchStart;
  const logModuleWithId = `${logModule} ${workerId} (t ${threadId})`;
  
  setGlobalDebugMode(asPoolOptions.debug);
  
  const rpc = createRpcClient(port);
  port.unref();

  const mode = isCollectTestsMode ? 'collectTests' : 'runTests';
  const diffOptions = typeof config.diff === 'object' ? config.diff : undefined;

  debug(`[${logModuleWithId}] -------- ${mode} starting -------- | dispatchToInit: ${dispatchToInit.toFixed(2)}ms`);
  debug(`[${logModuleWithId}] projectName: "${config.name}" | file: "${file.filepath}"`);

  try {
    const createUserWasmImports: WasmImportsFactory | undefined = await loadUserWasmImportsFactory(
      asPoolOptions.wasmImportsFactory,
      config.root,
      logModuleWithId
    );

    debug(`[${logModuleWithId}] ${mode} | awaiting file run`);

    await runSuite(
      rpc,
      port,
      basename(file.filepath),
      config.coverage.enabled && COVERAGE_SUPPORTED,
      compilation,
      file,
      logModuleWithId,
      asPoolOptions,
      { createUserWasmImports } satisfies ThreadImports,
      'v4',
      config.root,
      config.bail,
      diffOptions,
      timedOutTest,
    );
  } catch (error: any) {
    const testError = await buildEnhancedFileError(
      error,
      file,
      compilation.sourceMap,
      logModuleWithId,
      config.root,
      'test worker thread',
      diffOptions
    );
    
    failFile(file, testError, initPerf);

    await reportFileError(rpc, file, logModule, logModuleWithId);

    debug(`${logModuleWithId} - Reported file error`);
  } finally {
    await flushRpcUpdates(rpc);
    port.close();
    
    debug(`[${logModuleWithId}] -------- ${mode} completed file test run --------`);
  }

  return;
}
