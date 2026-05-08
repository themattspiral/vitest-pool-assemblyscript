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
} from '../types/types.js';
import { runCompileAndDiscover } from './runner/compile-runner.js';
import { debug, setGlobalDebugMode } from '../util/debug.js';
import { createRpcClient } from './rpc-reporter.js';
import { loadUserWasmImportsFactory } from './load-user-imports.js';
import { isNodeVersionSupportedForCoverage } from '../util/feature-check.js';

const logModule = `WorkerThread` as const;
const [_unused, initData] = workerData;
const { projectRoot, asPoolOptions, asCoverageOptions } = initData as WorkerThreadInitData;

setGlobalDebugMode(asPoolOptions.debug);
debug(`[${logModule}] New compile pool thread created`);

const COVERAGE_SUPPORTED = isNodeVersionSupportedForCoverage();

const createUserWasmImports: WasmImportsFactory | undefined = await loadUserWasmImportsFactory(
  asPoolOptions.wasmImportsFactory,
  projectRoot,
  logModule
);

export async function runCompileAndDiscoverSpec(data: RunCompileAndDiscoverTask): Promise<ThreadSpec> {
  const { dispatchStart, workerId, file, port, config } = data;

  const dispatchToInit = Date.now() - dispatchStart;
  const logModuleWithId = `${logModule} ${workerId} (t ${threadId})`;
  
  const rpc = createRpcClient(port);
  port.unref();

  debug(`[${logModuleWithId}] -------- compile and discover starting -------- | dispatchToInit: ${dispatchToInit.toFixed(2)}ms`);
  debug(`[${logModuleWithId}] Awaiting compilation | projectName: "${config.name}" | file: "${file.filepath}"`);

  const compilation = await runCompileAndDiscover(
    file,
    logModuleWithId,
    rpc,
    asPoolOptions,
    config.root,
    config.coverage.enabled && COVERAGE_SUPPORTED,
    asCoverageOptions.globbedAssemblyScriptProjectRelativeExcludeOnly ?? [],
    { createUserWasmImports } satisfies ThreadImports,
    typeof config.diff === 'object' ? config.diff : undefined,
    config.testNamePattern,
    config.allowOnly,
  );

  debug(`[${logModuleWithId}] -------- compile and discover completed run --------`);

  port.close();

  return { compilation, file };
}
