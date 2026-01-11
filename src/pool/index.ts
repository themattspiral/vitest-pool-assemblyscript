/**
 * AssemblyScript Pool for Vitest
 */

import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import Tinypool from 'tinypool';
import { ModuleCacheMap } from 'vite-node/client';
import { installSourcemapsSupport } from 'vite-node/source-map';
import type { Vitest, ProcessPool, TestSpecification } from 'vitest/node';
import type { Test } from '@vitest/runner/types';

import {
  ASSEMBLYSCRIPT_POOL_NAME,
  POOL_ERROR_NAMES,
} from '../types/constants.js';
import type {
  ResolvedHybridProviderOptions,
  AssemblyScriptResolvedConfig,
  TestExecutionStart,
  TestExecutionEnd,
  RunFileTask,
  WASMCompilation,
  TestRunRecord,
} from '../types/types.js';
import { setDebugMode, debug } from '../util/debug.js';
import { createWorkerChannel } from './worker-channel.js';
import { getAssemblyScriptResolvedConfig } from './pool-config.js';
import {
  createPoolError,
  createPoolErrorFromAnyError,
  isAbortError,
} from '../util/pool-errors.js';
import {
  createInitialFileTask,
  failTestWithTimeoutError,
} from '../util/vitest-tasks.js';

const WORKER_PATH = resolve(import.meta.dirname, 'pool-worker/index.mjs');

async function dispatchFullWorkerRun(
  spec: TestSpecification,
  config: AssemblyScriptResolvedConfig,
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

  // set debug mode within this async context
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);
  debug(`[Pool] ${base} - Starting file worker run at ${fileRunStart} for "${testFilePath}"`);

  let fileCompilation: WASMCompilation | undefined = fileCache.get(spec.moduleId);
  const isTimeoutRedispatch: boolean = !!previousTimedOutTest && !!fileCompilation;

  let timedOutTestThisRun: Test | undefined;

  try {
    const fileAbortController = new AbortController();
    const file = isTimeoutRedispatch
      ? previousTimedOutTest!.file
      : createInitialFileTask(spec.moduleId, spec.project.name, config.root, config.testTimeout, config.retry);
    const diffOptions = typeof spec.project.serializedConfig.diff === 'object'
      ? spec.project.serializedConfig.diff : undefined;
    const covExclusions = (config.coverage as ResolvedHybridProviderOptions).globbedAssemblyScriptProjectRelativeExcludeOnly || [];

    const { workerPort, poolPort } = createWorkerChannel(spec.project, isCollectTestsMode);

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
      if (event.binary) {
        fileCompilation = event as WASMCompilation;
        fileCache.set(fileCompilation.filePath, fileCompilation);
        debug(`[Pool] ${basename(fileCompilation.filePath)} - Got compiled file cache for "${fileCompilation.filePath}"`);
      } else if (event.executionStart) {
        const poolReceivedExecutionStart = Date.now();
        const { executionStart, test } = event as TestExecutionStart;

        const transitDuration = poolReceivedExecutionStart - executionStart;
        const adjustedTimeout = Math.max(test.timeout - transitDuration, 0);

        debug(`[Pool] ${base} - "${test.name}": Received worker execution start (transit ${transitDuration}ms)`
          + ` - Beginning test timeout timer ${test.timeout}ms (adjusted timeout: ${adjustedTimeout}ms)`
        );
        
        // Enforce test timeout
        const testTimeoutId = setTimeout(async () => {
          const poolTimeoutTime = Date.now();
          const record = testTimeoutCache.get(test.id);
          testTimeoutCache.delete(test.id);

          if (record) {
            const elapsedFromWorkerExecutionStart = poolTimeoutTime - record.runningTestStart;

            failTestWithTimeoutError(record.runningTest, poolTimeoutTime, elapsedFromWorkerExecutionStart);

            timedOutTestThisRun = test;
            fileAbortController.abort(POOL_ERROR_NAMES.WASMExecutionTimeoutError);

            debug(`[Pool] ${base} - "${record.runningTest.name}" timed out (threshold ${record.runningTest.timeout}ms)`
              + ` - Aborted worker job (duration before abort: ${elapsedFromWorkerExecutionStart}ms)`
            );
          }
        }, adjustedTimeout);

        testTimeoutCache.set(test.id, {
          runningTest: test,
          runningTestStart: executionStart,
          runnungTestTimeoutId: testTimeoutId,
        });

      } else if (event.executionEnd) {
        const poolReceivedExecutionEnd = Date.now();
        const { executionEnd, testTaskId } = event as TestExecutionEnd;
        const record = testTimeoutCache.get(testTaskId);
        testTimeoutCache.delete(testTaskId);

        if (record) {
          clearTimeout(record.runnungTestTimeoutId);

          const elapsedFromWorkerExecutionStart = executionEnd - record.runningTestStart!;
          const transitDuration = poolReceivedExecutionEnd - executionEnd;
          debug(`[Pool] ${base} - "${record.runningTest.name}": Received worker execution end (transit: ${transitDuration}ms)`
            + ` - Clearing test timeout timer - Actual duration from worker exection start: ${elapsedFromWorkerExecutionStart}ms`
          );
        }
      }
    });
    
    const workerTaskData: RunFileTask = {
      file,
      isCollectTestsMode,
      poolOptions,
      port: workerPort,
      projectRoot: config.root,
      diffOptions,
      collectCoverage: config.coverage.enabled,
      relativeUserCoverageExclusions: covExclusions,
      testNamePattern: config.testNamePattern,
      allowOnly: config.allowOnly,
      bail: config.bail,
      timedOutTest: previousTimedOutTest,
      timedOutCompilation: fileCompilation
    };

    try {
        await pool.run(workerTaskData, {
        name: 'runFile',
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
  config: AssemblyScriptResolvedConfig,
  isCollectTestsMode: boolean,
  pool: Tinypool,
  poolAbortController: AbortController,
  _invalidatedFiles?: string[]
): Promise<void> {
  const poolOptions = config.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);

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
    let timedOutTest = await dispatchFullWorkerRun(spec, config, isCollectTestsMode, pool, poolAbortController.signal, fileCache, testTimeoutCache);
    
    while (timedOutTest) {
      timedOutTest = await dispatchFullWorkerRun(spec, config, isCollectTestsMode, pool, poolAbortController.signal, fileCache, testTimeoutCache, timedOutTest);
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
        cause: unexpectedErrors
      };
    }
  }

  debug(`[Pool] Timeout Cache Size: ${testTimeoutCache.size}`);
  testTimeoutCache.forEach((record: TestRunRecord, testId: string) => {
    if (record) {
      debug(`[Pool] Leftover timeout entry for task: ${record.runningTest.name}`);
      clearTimeout(record.runnungTestTimeoutId);
    } else {
      debug(`[Pool] Empty test timeout entry for task: ${testId}`);
    }
  });

  debug(`[Pool] -------- ${mode} completed --------`);
}

export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  // Singleton module cache for source map support in worker threads
  // Shared across all tasks in this worker to enable accurate 
  // internal pool code stack traces
  const moduleCache = new ModuleCacheMap();

  // Install source map support for pool's own TypeScript code
  // This enables accurate stack traces when debugging the pool itself
  installSourcemapsSupport({
    getSourceMap: source => moduleCache.getSourceMap(source),
  });

  // Worker path resolution - worker must be pre-compiled JavaScript
  if (!existsSync(WORKER_PATH)) {
    throw createPoolError(`Worker file not found at ${WORKER_PATH}`, POOL_ERROR_NAMES.PoolError,);
  }

  // In multi-project mode, ctx.config is the global config, not the project-specific config
  // We need to find our project in ctx.projects to get project-specific poolOptions
  let projectConfig = ctx.config;
  let multiProjectName;
  
  if (ctx.projects && ctx.projects.length > 0) {
    // Multi-project mode: find the first project using this pool.
    // Use string.includes because project.config.pool resolves to the *path* of the dist file
    const project = ctx.projects.find(p => p.config.pool.includes(ASSEMBLYSCRIPT_POOL_NAME));

    if (project) {
      projectConfig = project.config;
      multiProjectName = project.name;
    }
  }

  // Resolve pool options and initialize debug mode
  const resolvedConfig = getAssemblyScriptResolvedConfig(ctx.config, projectConfig);
  const poolOptions = resolvedConfig.poolOptions.assemblyScript;
  setDebugMode(poolOptions.debug);

  debug('[Pool] Initializing AssemblyScript Pool');

  if (multiProjectName) {
    debug(`[Pool] Multi-project mode: Using config from project: "${multiProjectName}"`);
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

    // Explicitly reuse worker threads - WASM instances are already isolated
    isolateWorkers: false,
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
      return runTests(specs, resolvedConfig, isCollectTestsMode, pool, poolAbortController);
    },

    async runTests(specs: TestSpecification[], invalidates?: string[]) {
      const isCollectTestsMode = false;
      return runTests(specs, resolvedConfig, isCollectTestsMode, pool, poolAbortController, invalidates);
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
