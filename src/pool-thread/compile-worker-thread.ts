/**
 * Worker entry point - Compile Worker (vitest v4)
 */
import { threadId, workerData } from 'node:worker_threads';

import type {
  WorkerThreadInitData,
  RunCompileAndDiscoverTask,
  ThreadSpec,
  ThreadImports,
  WasmImportsFactory,
  WASMCompilation,
} from '../types/types.js';
import { runCompileAndDiscover } from './runner/compile-runner.js';
import { debug, setGlobalDebugMode } from '../util/debug.js';
import { createRpcClient, flushRpcUpdates, reportFileError, reportFileQueued } from './rpc-reporter.js';
import { isNodeVersionSupportedForCoverage } from '../util/feature-check.js';
import { loadUserWasmImportsFactory } from './load-user-imports.js';
import { failFile } from '../util/vitest-file-tasks.js';
import { buildEnhancedFileError } from '../util/pool-errors.js';

const logModule = `WorkerThread` as const;
const [_unused, initData] = workerData;
const { asCoverageOptions } = initData as WorkerThreadInitData;
const COVERAGE_SUPPORTED = isNodeVersionSupportedForCoverage();

export async function runCompileAndDiscoverSpec(data: RunCompileAndDiscoverTask): Promise<ThreadSpec> {
  const { dispatchStart, workerId, file, port, config, asPoolOptions } = data;
  const initPerf = performance.now();
  const dispatchToInit = Date.now() - dispatchStart;
  const logModuleWithId = `${logModule} ${workerId} (t ${threadId})`;

  setGlobalDebugMode(asPoolOptions.debug);
  
  const rpc = createRpcClient(port);
  port.unref();

  let compilation: WASMCompilation | undefined;
  const diffOptions = typeof config.diff === 'object' ? config.diff : undefined;

  try {
    debug(`[${logModuleWithId}] -------- compile and discover starting -------- | dispatchToInit: ${dispatchToInit.toFixed(2)}ms`);
    
    const createUserWasmImports: WasmImportsFactory | undefined = await loadUserWasmImportsFactory(
      asPoolOptions.wasmImportsFactory,
      config.root,
      logModuleWithId
    );
    
    debug(`[${logModuleWithId}] Awaiting compilation | projectName: "${config.name}" | file: "${file.filepath}"`);

    compilation = await runCompileAndDiscover(
      file,
      logModuleWithId,
      rpc,
      asPoolOptions,
      config.root,
      config.coverage.enabled && COVERAGE_SUPPORTED,
      asCoverageOptions.globbedAssemblyScriptProjectRelativeExcludeOnly ?? [],
      { createUserWasmImports } satisfies ThreadImports,
      diffOptions,
      config.testNamePattern,
      config.allowOnly,
    );
  } catch (error: any) {
    const testError = await buildEnhancedFileError(
      error,
      file,
      compilation?.sourceMap,
      logModuleWithId,
      config.root,
      'compile worker thread',
      diffOptions
    );

    failFile(file, testError, initPerf);
    
    await reportFileQueued(rpc, file, logModule, logModuleWithId);
    await reportFileError(rpc, file, logModule, logModuleWithId);
    
    debug(`${logModuleWithId} - Reported file error`);
  } finally {
    await flushRpcUpdates(rpc);
    port.close();
    
    debug(`[${logModuleWithId}] -------- compile and discover completed run --------`);
  }

  return { compilation, file };
}
