/**
 * Worker entry point - Tinypool (vitest v3)
 */
import { basename } from 'node:path';
import { threadId, workerData } from 'node:worker_threads';
import { workerId } from 'tinypool';

import type {
  ProcessPoolRunFileTask,
  TestFileCompiled,
  ThreadImports,
  WasmImportsFactory,
  WorkerThreadInitData
} from '../types/types.js';
import { AS_POOL_WORKER_MSG_FLAG } from '../types/constants.js';
import { debug, setGlobalDebugMode } from '../util/debug.js';
import { createRpcClient, flushRpcUpdates, reportFileError } from './rpc-reporter.js';
import { runCompileAndDiscover } from './runner/compile-runner.js';
import { runSuite } from './runner/test-runner.js';
import { loadUserWasmImportsFactory } from './load-user-imports.js';
import { isNodeVersionSupportedForCoverage } from '../util/feature-check.js';
import { getTestErrorFromAnyError } from '../util/pool-errors.js';
import { failFile } from '../util/vitest-file-tasks.js';

const logModule = `WorkerThread` as const;
const [_unused, initData] = workerData;
const { asCoverageOptions } = initData as WorkerThreadInitData;
const COVERAGE_SUPPORTED = isNodeVersionSupportedForCoverage();

export async function runTestFile(taskData: ProcessPoolRunFileTask): Promise<void> {
  const {
    dispatchStart, port, file, config, asPoolOptions,
    isCollectTestsMode, timedOutTest, timedOutCompilation
  } = taskData;
  const initPerf = performance.now();
  const dispatchToInit = Date.now() - dispatchStart;
  const logModuleWithId = `${logModule} ${workerId} (t ${threadId})`;
  const mode = isCollectTestsMode ? 'collectTests' : 'runTests';
  
  setGlobalDebugMode(asPoolOptions.debug);

  const rpc = createRpcClient(port);
  port.unref();

  try {
    debug(`[${logModuleWithId}] -------- ${mode} starting -------- | dispatchToInit: ${dispatchToInit.toFixed(2)}ms`);
    debug(`[${logModuleWithId}] projectName: "${config.name}" | file: "${file.filepath}"`);

    const createUserWasmImports: WasmImportsFactory | undefined = await loadUserWasmImportsFactory(
      asPoolOptions.wasmImportsFactory,
      config.root,
      logModuleWithId
    );

    const compilation = timedOutCompilation ?? await runCompileAndDiscover(
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

    if (compilation && !timedOutCompilation) {
      port.postMessage({
        compilation,
        type: 'file-compiled',
        [AS_POOL_WORKER_MSG_FLAG]: true
      } satisfies TestFileCompiled);

      debug(`[${logModuleWithId}] compiled binary and transferred back to main pool for "${compilation.filePath}"`);
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
        { createUserWasmImports } satisfies ThreadImports,
        'v3',
        config.root,
        config.bail,
        typeof config.diff === 'object' ? config.diff : undefined,
        timedOutTest,
      );
    } else {
      debug(`[${logModuleWithId}] Skipping file suite run`);
    }
  } catch (error) {
    const testError = getTestErrorFromAnyError(error);

    failFile(file, testError, initPerf);
    
    await reportFileError(rpc, file, logModule, logModuleWithId);
    
    debug(`${logModuleWithId} - Reported file error`);
  } finally {
    await flushRpcUpdates(rpc);
    port.close();
    
    debug(`[${logModuleWithId}] -------- ${mode} completed file run --------`);
  }

  return;
}
