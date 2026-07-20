/**
 * AssemblyScript Pool for Vitest
 */

import { resolve, basename } from 'node:path';
import { access } from 'node:fs/promises';
import Tinypool from 'tinypool';
import type { Vitest, ProcessPool, TestSpecification } from 'vitest/node';
import type { RunnerTestCase } from 'vitest';

import {
  AS_POOL_WORKER_MSG_FLAG,
  ASSEMBLYSCRIPT_POOL_NAME,
  POOL_ERROR_NAMES,
} from '../types/constants.js';
import type {
  ProcessPoolRunFileTask,
  WASMCompilation,
  TestRunRecord,
  AssemblyScriptPoolWorkerMessage,
  WorkerThreadInitData,
  SerializedConfigCompat,
  ResolvedAssemblyScriptPoolOptions,
} from '../types/types.js';
import { setGlobalDebugMode, debug } from '../util/debug.js';
import { createWorkerRPCChannel } from './worker-rpc-channel.js';
import {
  isAbortError,
} from '../util/pool-errors.js';
import {
  failTestWithTimeoutError,
  flagTestTerminated,
} from '../util/vitest-tasks.js';
import { createInitialFileTask } from '../util/vitest-file-tasks.js';
import { getCompatConfig, getConfigs } from '../util/resolve-config.js';

// path assumes that we're running from dist/
const WORKER_PATH = resolve(import.meta.dirname, 'pool-thread/v3-tinypool-thread.mjs');

const POOL_THREAD_IDLE_TIMEOUT_MS = 3_600_000;

async function dispatchFullWorkerRun(
  spec: TestSpecification,
  config: SerializedConfigCompat,
  asPoolOptions: ResolvedAssemblyScriptPoolOptions,
  isCollectTestsMode: boolean,
  pool: Tinypool,
  poolAbortSignal: AbortSignal,
  fileCache: Map<string, WASMCompilation>,
  testTimeoutCache: Map<string, TestRunRecord>,
  previousTimedOutTest?: RunnerTestCase,
): Promise<RunnerTestCase | undefined> {
  const fileRunStart = Date.now();
  const testFilePath: string = spec.moduleId; // absolute path
  const base = basename(testFilePath);

  debug(`[Pool] ${base} - Starting file worker run at ${fileRunStart} for "${testFilePath}"`);

  let fileCompilation: WASMCompilation | undefined = fileCache.get(spec.moduleId);
  const isTimeoutRedispatch: boolean = !!previousTimedOutTest && !!fileCompilation;

  let timedOutTestThisRun: RunnerTestCase | undefined;

  try {
    const fileAbortController = new AbortController();
    const file = isTimeoutRedispatch
      ? previousTimedOutTest!.file
      : createInitialFileTask(spec.moduleId, spec.project.name, config.root, config.testTimeout, config.retry, 'v3');

    const { workerPort, poolPort } = createWorkerRPCChannel(spec.project, isCollectTestsMode);

    // Enforce per-phase timeout windows using setTimeout() and worker messages.
    //   1. worker sends execution-start when a test attempt begins — the pool arms an
    //      initial window with the test's timeout (covers instantiation + _start() init)
    //   2. worker sends phase-start/phase-end around each hook fn and the test fn — the
    //      pool re-arms the timer to each phase's own window (per-hook effective timeout,
    //      or the test's timeout for the test-fn phase)
    //   3. worker sends execution-end when the attempt completes
    //     - if each phase completes before its window expires, the timer is cleared and everything proceeds
    //     - if a window expires, the test worker is actively aborted using the test-specific AbortController,
    //       and the armed phase attributes the error (hook vs test timeout message)
    //
    // Monitoring from the pool main thread and actively aborting the runner allows for accurate enforcement of the timeout,
    // which is much harder/impossible to control from within the worker thread itself, which is busy/blocked running
    // the long-running WASM test.
    const firePhaseTimeout = (testTaskId: string): void => {
      const poolTimeoutTime = Date.now();
      const record = testTimeoutCache.get(testTaskId);
      testTimeoutCache.delete(testTaskId);

      if (record) {
        const elapsedFromWorkerExecutionStart = poolTimeoutTime - record.executionStart;

        failTestWithTimeoutError(
          record.test,
          record.executionStart,
          elapsedFromWorkerExecutionStart,
          record.phase,
          record.phaseEffectiveTimeout
        );

        flagTestTerminated(record.test);

        timedOutTestThisRun = record.test;
        fileAbortController.abort(POOL_ERROR_NAMES.WASMExecutionTimeoutError);

        debug(`[Pool] ${base} - "${record.test.name}" timed out in ${record.phase} phase (window ${record.phaseEffectiveTimeout} ms)`
          + ` - Aborted worker job (duration before abort: ${elapsedFromWorkerExecutionStart} ms)`
        );
      }
    };

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
          + ` - Beginning init timeout window ${test.timeout} ms (adjusted timeout: ${adjustedTimeout} ms)`
        );

        // initial window covers the init segment (instantiation + _start());
        // phase-start messages then re-arm to each phase's own window
        testTimeoutCache.set(test.id, {
          test: test,
          executionStart: executionStart,
          phase: 'test',
          phaseEffectiveTimeout: test.timeout,
          timeoutId: setTimeout(() => firePhaseTimeout(test.id), adjustedTimeout),
        });

      } else if (msg.type === 'phase-start') {
        const poolReceivedPhaseStart = Date.now();
        const { phaseStart, testTaskId, phase, effectiveTimeout } = msg;
        const record = testTimeoutCache.get(testTaskId);

        if (record) {
          clearTimeout(record.timeoutId);

          const transitDuration = poolReceivedPhaseStart - phaseStart;
          const adjustedTimeout = Math.max(effectiveTimeout - transitDuration, 0);

          record.phase = phase;
          record.phaseEffectiveTimeout = effectiveTimeout;
          record.timeoutId = setTimeout(() => firePhaseTimeout(testTaskId), adjustedTimeout);

          debug(`[Pool] ${base} - "${record.test.name}": Beginning ${phase} phase timeout window`
            + ` ${effectiveTimeout} ms (adjusted timeout: ${adjustedTimeout} ms)`
          );
        }

      } else if (msg.type === 'phase-end') {
        const record = testTimeoutCache.get(msg.testTaskId);

        if (record) {
          clearTimeout(record.timeoutId);
          record.timeoutId = undefined;

          debug(`[Pool] ${base} - "${record.test.name}": Cleared ${record.phase} phase timeout window`);
        }

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
      asPoolOptions,
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
    } else {
      // abort errors are expected, otherwise rethrow
      throw error;
    }
  } finally {
    debug(`[Pool] ${base} - Finished File Worker Execution`);
  }
}

/**
 * Run / Collect tests
 */
async function runTests(
  specs: TestSpecification[],
  projectConfigs: {
    [key: string]: {
      config: SerializedConfigCompat,
      v3PoolOptions?: ResolvedAssemblyScriptPoolOptions
    }
  },
  fallbackPoolOptions: ResolvedAssemblyScriptPoolOptions,
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
    const compatConfig: SerializedConfigCompat = getCompatConfig(serializedConfig);
    const asPoolOptions = projectConfigs[spec.project.name]?.v3PoolOptions ?? fallbackPoolOptions;
    
    let timedOutTest = await dispatchFullWorkerRun(spec, compatConfig, asPoolOptions, isCollectTestsMode, pool, poolAbortController.signal, fileCache, testTimeoutCache);
    
    while (timedOutTest) {
      timedOutTest = await dispatchFullWorkerRun(spec, compatConfig, asPoolOptions, isCollectTestsMode, pool, poolAbortController.signal, fileCache, testTimeoutCache, timedOutTest);
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
  const { coverage, projects, fallbackPoolOptions } = getConfigs(ctx);
  
  setGlobalDebugMode(fallbackPoolOptions.debug);

  debug('[Pool] Initializing AssemblyScript Pool');
  debug(`[Pool] Worker thread path: "${WORKER_PATH}"`);
  debug(`[Pool] Worker thread configuration - maxThreads: ${fallbackPoolOptions.maxThreadsV3}`);

  setImmediate(async () => {
    const results = await Promise.allSettled([
      access(WORKER_PATH)
    ]);

    if (results[0].status === 'rejected') {
      throw new Error(`Cannot access worker thread file at path: "${WORKER_PATH}"`);
    }
  });

  // Initialize Tinypool for worker management
  const pool = new Tinypool({
    filename: WORKER_PATH,
    minThreads: 1,
    maxThreads: fallbackPoolOptions.maxThreadsV3,
    idleTimeout: POOL_THREAD_IDLE_TIMEOUT_MS,
    isolateWorkers: false,
    workerData: {
      asCoverageOptions: coverage,
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
      return runTests(specs, projects, fallbackPoolOptions, isCollectTestsMode, pool, poolAbortController);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      const isCollectTestsMode = false;
      return runTests(specs, projects, fallbackPoolOptions, isCollectTestsMode, pool, poolAbortController, invalidates);
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
