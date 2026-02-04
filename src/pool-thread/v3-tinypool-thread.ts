/**
 * Worker entry point - Tinypool (vitest v3)
 */
import { basename } from 'node:path';
import { threadId, workerData } from 'node:worker_threads';
import { workerId } from 'tinypool';
// @ts-ignore - we build with v4, but this is correct for v3 runtime
import { highlight } from '@vitest/utils';

import type { ProcessPoolRunFileTask, TestFileCompiled, ThreadImports, WasmImportsFactory, WorkerThreadInitData } from '../types/types.js';
import { AS_POOL_WORKER_MSG_FLAG } from '../types/constants.js';
import { debug, setGlobalDebugMode } from '../util/debug.js';
import { createRpcClient } from './rpc-reporter.js';
import { runCompileAndDiscover } from './runner/compile-runner.js';
import { runSuite } from './runner/test-runner.js';
import { loadUserWasmImportsFactory } from './load-user-imports.js';
import { isCoverageSupported } from '../util/node-check.js';

const logModule = `WorkerThread` as const;
const [_unused, initData] = workerData;
const { asPoolOptions, asCoverageOptions, projectRoot } = initData as WorkerThreadInitData;

setGlobalDebugMode(asPoolOptions.debug);
debug(`[${logModule}] New pool thread created`);

const COVERAGE_SUPPORTED = isCoverageSupported();

const createUserWasmImports: WasmImportsFactory | undefined = await loadUserWasmImportsFactory(
  asPoolOptions.wasmImportsFactory,
  projectRoot,
  logModule
);

export async function runTestFile(taskData: ProcessPoolRunFileTask): Promise<void> {
  const {
    dispatchStart, port, file, config, isCollectTestsMode,
    timedOutTest, timedOutCompilation
  } = taskData;

  const dispatchToInit = Date.now() - dispatchStart;
  const logModuleWithId = `WorkerThread ${workerId} (t ${threadId})`;
  const rpc = createRpcClient(port);
  port.unref();

  const mode = isCollectTestsMode ? 'collectTests' : 'runTests';
  debug(`[${logModuleWithId}] -------- ${mode} starting -------- | dispatchToInit: ${dispatchToInit.toFixed(2)}ms`);
  debug(`[${logModuleWithId}] projectName: "${config.name}" | file: "${file.filepath}"`);
    
  const compilation = timedOutCompilation ?? await runCompileAndDiscover(
    file,
    logModuleWithId,
    rpc,
    asPoolOptions,
    config.root,
    config.coverage.enabled && COVERAGE_SUPPORTED,
    asCoverageOptions.globbedAssemblyScriptProjectRelativeExcludeOnly ?? [],
    { highlight, createUserWasmImports } satisfies ThreadImports,
    typeof config.diff === 'object' ? config.diff : undefined,
    config.testNamePattern,
    config.allowOnly,
  );

  if (compilation && !timedOutCompilation) {
    port.postMessage({
      compilation,
      type: 'file-compiled',
      [AS_POOL_WORKER_MSG_FLAG]: true
    } satisfies TestFileCompiled);
    debug(`[${logModuleWithId}] sent compilation to pool for "${compilation.filePath}"`);
  }
  
  if (compilation && !isCollectTestsMode) {
		debug(`[${logModuleWithId}] Running file suite`);
    await runSuite(
      rpc,
      port,
      basename(file.filepath),
      config.coverage.enabled && COVERAGE_SUPPORTED,
      compilation,
      file,
      logModuleWithId,
      asPoolOptions,
      { highlight, createUserWasmImports } satisfies ThreadImports,
      'v3',
      config.bail,
      typeof config.diff === 'object' ? config.diff : undefined,
      timedOutTest,
    );
  } else {
		debug(`[${logModuleWithId}] Skipping file suite run`);
	}

  debug(`[${logModuleWithId}] -------- ${mode} completed file run --------`);
  port.close();

  return;
}
