/**
 * AssemblyScript Pool for Vitest
 */

import { resolve, basename } from 'node:path';
import { access } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import Tinypool from 'tinypool';
import type { SerializedConfig } from 'vitest';
import type { Vitest, ProcessPool, TestSpecification } from 'vitest/node';
import type { Test } from '@vitest/runner/types';

import {
  AS_POOL_WORKER_MSG_FLAG,
  ASSEMBLYSCRIPT_POOL_NAME,
  POOL_ERROR_NAMES,
} from '../types/constants.js';
import type {
  ResolvedHybridProviderOptions,
  ProcessPoolRunFileTask,
  WASMCompilation,
  TestRunRecord,
  AssemblyScriptPoolWorkerMessage,
  WorkerThreadInitData,
} from '../types/types.js';
import { setGlobalDebugMode, debug } from '../util/debug.js';
import { createWorkerRPCChannel } from './worker-rpc-channel.js';
import {
  createPoolError,
  createPoolErrorFromAnyError,
  isAbortError,
} from '../util/pool-errors.js';
import {
  failTestWithTimeoutError,
  flagTestTerminated,
} from '../util/vitest-tasks.js';
import { createInitialFileTask } from '../util/vitest-file-tasks.js';
import { getProjectSerializedOrGlobalConfig, resolvePoolOptions } from '../util/resolve-config.js';

// path assumes that we're running from dist/
const WORKER_PATH = resolve(import.meta.dirname, 'pool-thread/v3-tinypool-thread.mjs');

const POOL_THREAD_IDLE_TIMEOUT_MS = 3_600_000;

async function dispatchFullWorkerRun(
  spec: TestSpecification,
  config: SerializedConfig,
  isCollectTestsMode: boolean,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
  fileCache: Map<string, WASMCompilation>,
  testTimeoutCache: Map<string, TestRunRecord>,
  previousTimedOutTest?: Test,
): Promise<Test | undefined> {
  const fileRunStart = Date.now();
  const testFilePath: string = spec.moduleId; // absolute path
  const base = basename(testFilePath);

  debug(`[Pool] ${base} - Starting file worker run at ${fileRunStart} for "${testFilePath}"`);

  let fileCompilation: WASMCompilation | undefined = fileCache.get(spec.moduleId);
  const isTimeoutRedispatch: boolean = !!previousTimedOutTest && !!fileCompilation;

  let timedOutTestThisRun: Test | undefined;

  try {
    const fileAbortController = new AbortController();
    const file = isTimeoutRedispatch
      ? previousTimedOutTest!.file
      : createInitialFileTask(spec.moduleId, spec.project.name, config.root, config.testTimeout, config.retry);

    const { workerPort, poolPort } = createWorkerRPCChannel(spec.project, isCollectTestsMode);

    // Enforce test timeout using setTimeout() and worker messages.
    //   1. worker sends a start message to indicate when the test has started
    //   2. pool starts a timer using setTimeout() when worker start message is received
    //   3. worker sends an end message to indicate when the test has completed
    //     - if test completes before the timeout expires, the timer is cleared and everything proceeds
    //     - if timeout expires, the test worker is actively aborted using the test-specific AbortController
    //
    // Monitoring from the pool main thread and actively aborting the runner allows for accurate enforcement of the test timeout,
    // which is much harder/impossible to control from within the worker thread itself, which is busy/blocked running 
    // the long-running WASM test.
    poolPort.on('message', event => {
      if (!event[AS_POOL_WORKER_MSG_FLAG]) return;

      const msg = event as AssemblyScriptPoolWorkerMessage;
      if (msg.type === 'file-compiled') {
        const { compilation } = msg;
        fileCache.set(compilation.filePath, compilation);
        debug(`[Pool] ${basename(compilation.filePath)} - Got compiled file cache for "${compilation.filePath}"`);
      } else if (msg.type === 'execution-start') {
        const poolReceivedExecutionStart = Date.now();
        const { executionStart, test } = msg;

        const transitDuration = poolReceivedExecutionStart - executionStart;
        const adjustedTimeout = Math.max(test.timeout - transitDuration, 0);

        debug(`[Pool] ${base} - "${test.name}": Received worker execution start (transit ${transitDuration} ms)`
          + ` - Beginning test timeout timer ${test.timeout} ms (adjusted timeout: ${adjustedTimeout} ms)`
        );
        
        // Enforce test timeout
        const testTimeoutId = setTimeout(async () => {
          const poolTimeoutTime = Date.now();
          const record = testTimeoutCache.get(test.id);
          testTimeoutCache.delete(test.id);

          if (record) {
            const elapsedFromWorkerExecutionStart = poolTimeoutTime - record.executionStart;

            failTestWithTimeoutError(record.test, poolTimeoutTime, elapsedFromWorkerExecutionStart);

            flagTestTerminated(record.test);

            timedOutTestThisRun = test;
            fileAbortController.abort(POOL_ERROR_NAMES.WASMExecutionTimeoutError);

            debug(`[Pool] ${base} - "${record.test.name}" timed out (threshold ${record.test.timeout} ms)`
              + ` - Aborted worker job (duration before abort: ${elapsedFromWorkerExecutionStart} ms)`
            );
          }
        }, adjustedTimeout);

        testTimeoutCache.set(test.id, {
          test: test,
          executionStart: executionStart,
          timeoutId: testTimeoutId,
        });

      } else if (msg.type === 'execution-end') {
        const poolReceivedExecutionEnd = Date.now();
        const { executionEnd, testTaskId } = msg;
        const record = testTimeoutCache.get(testTaskId);
        testTimeoutCache.delete(testTaskId);

        if (record) {
          clearTimeout(record.timeoutId);

          const elapsedFromWorkerExecutionStart = executionEnd - record.executionStart!;
          const transitDuration = poolReceivedExecutionEnd - executionEnd;
          debug(`[Pool] ${base} - "${record.test.name}": Received worker execution end (transit: ${transitDuration} ms)`
            + ` - Clearing test timeout timer - Actual duration from worker exection start: ${elapsedFromWorkerExecutionStart} ms`
          );
        }
      }
    });
    
    const workerTaskData: ProcessPoolRunFileTask = {
      dispatchStart: Date.now(),
      port: workerPort,
      file,
      config,
      isCollectTestsMode,
      timedOutTest: previousTimedOutTest,
      timedOutCompilation: fileCompilation
    };

    try {
        await pool.run(workerTaskData, {
        name: 'runTestFile',
        transferList: [workerPort],
        signal: AbortSignal.any([poolAbortSignal, fileAbortController.signal]),
      });
    } finally {
      workerPort.close();
      poolPort.close();
    }
    
    return;
  } catch (error) {
    if (isAbortError(error)) {
      debug(`[Pool] ${base} - file worker aborted during run: ${String(error)}`);
      
      if (!!timedOutTestThisRun) {
        // swallow abort error, return timed out test so worker can be re-launched
        return timedOutTestThisRun;
      } else {
        // swallow abort error, this file worker run is done
        return;
      }
    }

    throw createPoolErrorFromAnyError(`${base} - unhandled file worker failure`, POOL_ERROR_NAMES.PoolError, error);
  } finally {
    debug(`[Pool] ${base} - Finished File Worker Execution`);
  }
}

/**
 * Run / Collect tests
 */
async function runTests(
  specs: TestSpecification[],
  isCollectTestsMode: boolean,
  pool: Tinypool,
  poolAbortController: AbortController,
  _invalidatedFiles?: string[]
): Promise<void> {
  const mode = isCollectTestsMode ? 'collectTests' : 'runTests';
  debug(`[Pool] -------- ${mode} called for ${specs.length} specs --------`);

  // TODO - invalidation
  // const invalidCount = invalidatedFiles?.length ?? 0;
  // debug('[Pool] Invalidated files:', invalidCount);

  // if (invalidCount > 0) {
  //   // probably:
  //   //   0. pre-build a cached map of source files to specs that import them (using debuginfo?)
  //   //   1. check if invalidated file is in map: if NOT ignore & continue loop to next file
  //   //   2. create file worker for each spec the invalidated file maps to
  // }

  const fileCache: Map<string, WASMCompilation> = new Map();
  const testTimeoutCache: Map<string, TestRunRecord> = new Map();

  // Create worker for each file
  const fileWorkers: Promise<void>[] = specs.map(async (spec: TestSpecification): Promise<void> => {
    const { serializedConfig } = spec.project;
    let timedOutTest = await dispatchFullWorkerRun(spec, serializedConfig, isCollectTestsMode, pool, poolAbortController.signal, fileCache, testTimeoutCache);
    
    while (timedOutTest) {
      timedOutTest = await dispatchFullWorkerRun(spec, serializedConfig, isCollectTestsMode, pool, poolAbortController.signal, fileCache, testTimeoutCache, timedOutTest);
    }
  });

  if (isCollectTestsMode) {
    try {
      await Promise.all(fileWorkers);
      debug('[Pool] collectTests - All file workers resolved');
    } catch (err) {
      debug('[Pool] collectTests - File worker REJECTED, Calling Pool Abort to bail this collectTests run');
      poolAbortController.abort();
    }
  } else {
    const results = await Promise.allSettled(fileWorkers);
    const unexpectedErrors: any[] = [];
    results.forEach(r => {
      if (r.status === 'rejected') {
        unexpectedErrors.push(r.reason);
      }
    });

    if (unexpectedErrors.length === 0) {
      debug(`[Pool] ${mode} - All file workers resolved`);
    } else {
      debug(`[Pool] ${mode} - Some file workers REJECTED unexpectedly. Throwing error(s) to vitest:`, unexpectedErrors);
      throw {
        name: POOL_ERROR_NAMES.PoolError,
        message: `Unexpected AssemblyScript Pool Error(s) Encountered during ${mode}`,
        cause: unexpectedErrors[0]
      };
    }
  }

  debug(`[Pool] Timeout Cache Size: ${testTimeoutCache.size}`);
  testTimeoutCache.forEach((record: TestRunRecord, testId: string) => {
    if (record) {
      debug(`[Pool] Leftover timeout entry for task: ${record.test.name}`);
      clearTimeout(record.timeoutId);
    } else {
      debug(`[Pool] Empty test timeout entry for task: ${testId}`);
    }
  });

  debug(`[Pool] -------- ${mode} completed --------`);
}

export function createAssemblyScriptProcessPool(ctx: Vitest): ProcessPool {
  setImmediate(async () => {
    try {
      await access(WORKER_PATH);
    } catch {
      throw createPoolError(`Cannot access worker thread file at path: ${WORKER_PATH}`, POOL_ERROR_NAMES.PoolError);
    }
  });

  const { config, foundProjectSerializedConfig } = getProjectSerializedOrGlobalConfig(ctx);
  
  // Resolve pool options and initialize debug mode
  // @ts-ignore - we build with v4, but this is correct for v3 (has Config.poolOptions)
  const poolOptions = resolvePoolOptions(config?.poolOptions);
  setGlobalDebugMode(poolOptions.debug);

  debug('[Pool] Initializing AssemblyScript Pool');

  if (foundProjectSerializedConfig) {
    debug(`[Pool] Multi-project mode: Using config from project: "${config.name}"`);
  } else {
    debug('[Pool] Single-project mode: No project config found using vitest-pool-assemblyscript pool - Using global config with AssemblyScript pool defaults');
  }

  const maxThreads = poolOptions.maxThreads ?? availableParallelism() - 1;

  debug(`[Pool] Worker path: "${WORKER_PATH}"`);
  debug(`[Pool] Worker configuration - maxThreads: ${maxThreads}`);

  // Initialize Tinypool for worker management
  const pool = new Tinypool({
    filename: WORKER_PATH,
    minThreads: 1,
    maxThreads,
    idleTimeout: POOL_THREAD_IDLE_TIMEOUT_MS,
    isolateWorkers: false,
    workerData: {
      asPoolOptions: poolOptions,
      asCoverageOptions: config.coverage as ResolvedHybridProviderOptions
    } satisfies WorkerThreadInitData,
  });

  // For explicitly terminating all worker threads because of
  // ctrl+c in terminal, or bail after test failures exceed bail count
  const poolAbortController = new AbortController();
  ctx.onCancel(reason => {
    const reasonMsg = reason === 'test-failure' ? 'Bail after test failure' : reason;
    console.log(`${ASSEMBLYSCRIPT_POOL_NAME} - Aborting all tests: ${reasonMsg}`);
    poolAbortController.abort();
  });

  return {
    name: ASSEMBLYSCRIPT_POOL_NAME,

    // runs when executing vitest list
    async collectTests(specs: TestSpecification[]) {
      const isCollectTestsMode = true;
      return runTests(specs, isCollectTestsMode, pool, poolAbortController);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      const isCollectTestsMode = false;
      return runTests(specs, isCollectTestsMode, pool, poolAbortController, invalidates);
    },

    // Cleanup when shutting down
    async close() {
      debug('[Pool] AbortController called');
      poolAbortController.abort();
      
      debug('[Pool] Tinypool destroyed');
      await pool.destroy();

      debug('[Pool] Exiting');
    },
  };
}
