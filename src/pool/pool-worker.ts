import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import type { MessagePort } from 'node:worker_threads';
import type { Test } from '@vitest/runner/types';
import type { PoolWorker, PoolOptions, WorkerRequest, PoolTask, WorkerResponse } from 'vitest/node';
import Tinypool from 'tinypool';

import type {
  AssemblyScriptPoolWorkerMessage,
  ResolvedAssemblyScriptPoolOptions,
  ResolvedHybridProviderOptions,
  RunCompileAndDiscoverTask,
  RunTestsTask,
  SerializedConfigCompat,
  TestExecutionEnd,
  TestExecutionStart,
  TestRunRecord,
  ThreadSpec,
  WorkerThreadInitData,
} from '../types/types.js';
import { toForwardSlash } from '../util/path-utils.js';
import { createInitialFileTask } from '../util/vitest-file-tasks.js';
import { failTestWithTimeoutError, flagTestTerminated } from '../util/vitest-tasks.js';
import {
  AS_POOL_WORKER_MSG_FLAG,
  ASSEMBLYSCRIPT_POOL_NAME,
  POOL_ERROR_NAMES,
  VITEST_WORKER_RESPONSE_MSG_FLAG
} from '../types/constants.js';
import { debug, setGlobalDebugMode } from '../util/debug.js';
import { createPoolError, isAbortError } from '../util/pool-errors.js';
import { createWorkerRPCChannel } from './worker-rpc-channel.js';
import { getCompatConfig } from '../util/resolve-config.js';

type GlobalThreadPools = { compilePool: Tinypool, runPool: Tinypool };
type EventCallback = (arg: any) => void;

const THREAD_RESOLVE_TIMEOUT_MS = 2000 as const;
const POOL_THREAD_IDLE_TIMEOUT_MS = 3_600_000 as const;

// path assumes that we're running from dist/
const COMPILE_WORKER_PATH = resolve(import.meta.dirname, 'pool-thread/compile-worker-thread.mjs');
const TEST_WORKER_PATH = resolve(import.meta.dirname, 'pool-thread/test-worker-thread.mjs');

var GLOBAL_POOLS_PROMISE: Promise<GlobalThreadPools> | undefined;
var GLOBAL_POOL_ABORT_CONTROLLER: AbortController | undefined;
var GLOBAL_RUNNING_POOLWORKER_COUNT: number = 0;

export class AssemblyScriptPoolWorker implements PoolWorker {
  readonly logModule = 'PoolWorker' as const;
  readonly name: typeof ASSEMBLYSCRIPT_POOL_NAME = ASSEMBLYSCRIPT_POOL_NAME;
  readonly poolOptions: PoolOptions;
  readonly asPoolOptions: ResolvedAssemblyScriptPoolOptions;
  readonly asCoverageOptions: ResolvedHybridProviderOptions;

  // for the currently running thread preforming a test run (if any)
  private threadAbortController: AbortController | undefined;
  private threadControlPort: MessagePort | undefined;
  private threadRunPromise: Promise<void> | undefined;

  private threadSpecs: ThreadSpec[] = [];
  
  // cached data for possible timeout resume
  private currentTestRun: TestRunRecord | undefined;
  
  // for this particular PoolWorker instance (1 per `maxWorkers`)
  private currentWorkerId: number | undefined;
  private isWorkerRunning: boolean = false;
  private config: SerializedConfigCompat | undefined; // provided with "start" message

  // registry holding vitest callbacks so we can communicate on behalf of the worker thread
  private listenerRegistry: Map<string, Set<EventCallback>>;

  constructor(
    options: PoolOptions,
    resolvedUserPoolOptions: ResolvedAssemblyScriptPoolOptions,
    resolvedCoverageOptions: ResolvedHybridProviderOptions,
  ) {
    const start = performance.now();

    this.poolOptions = options;
    this.asPoolOptions = resolvedUserPoolOptions;
    this.asCoverageOptions = resolvedCoverageOptions;
    this.listenerRegistry = new Map<string, Set<EventCallback>>();

    setImmediate(async () => {
      const results = await Promise.allSettled([
        access(COMPILE_WORKER_PATH),
        access(TEST_WORKER_PATH)
      ]);

      const failedThreadAccess: string[] = [];
      if (results[0].status === 'rejected') failedThreadAccess.push(COMPILE_WORKER_PATH);
      if (results[1].status === 'rejected') failedThreadAccess.push(TEST_WORKER_PATH);

      if (failedThreadAccess.length) {
        throw new Error(`Cannot access worker thread file(s) at path(s): ${failedThreadAccess}`);
      }
    });
    
    setGlobalDebugMode(this.asPoolOptions.debug);

    debug(`[${this.logModule}] Created AssemblyScriptPoolWorker in ${(performance.now() - start).toFixed(2)} ms`
      + ` | method: "${this.poolOptions.method}" | project: "${this.poolOptions.project.name}"`
      + ` | asPoolOptions: ${JSON.stringify(this.asPoolOptions)}`
    );
  }

  private get isCollectTestsMode(): boolean {
    return this.poolOptions.method === 'collect';
  }

  async start(): Promise<void> {
    // do all work in send() message intercept handler so we have access to the config
  }

  async stop(): Promise<void> {
    debug(`[${this.logModuleWithId}] stop | running PoolWorker count: ${GLOBAL_RUNNING_POOLWORKER_COUNT}`);

    this.listenerRegistry.clear();
    GLOBAL_RUNNING_POOLWORKER_COUNT--;
    this.isWorkerRunning = false;

    debug(`[${this.logModuleWithId}] AssemblyScriptPoolWorker STOPPED | running PoolWorker count: ${GLOBAL_RUNNING_POOLWORKER_COUNT}`);
    this.currentWorkerId = undefined;
  }

  send(message: WorkerRequest): void {
    switch(message.type) {
      
      // this happens AFTER start() is called (start() is for PoolWorker, "start" is for thread)
      case 'start':
        this.currentWorkerId = message.workerId;
        this.config = getCompatConfig(message.context.config);
        debug(`[${this.logModuleWithId}] send: vitest sent "start" message | Captured workerId and config`);

        setImmediate(async () => {
          const start = performance.now();
          const { compilePool, runPool } = await this.getGlobalThreadPools();
          
          debug(`[${this.logModuleWithId}] start: fetched global thread pools in ${(performance.now() - start).toFixed(2)} ms`
            + ` | compilePool queueSize: ${compilePool.queueSize} | runPool queueSize: ${runPool.queueSize}`
          );
          
          this.isWorkerRunning = true;
          GLOBAL_RUNNING_POOLWORKER_COUNT++;
          debug(`[${this.logModuleWithId}] start | new running PoolWorker count: ${GLOBAL_RUNNING_POOLWORKER_COUNT}`);
          
          this.notifyVitest('started');
          debug(`[${this.logModuleWithId}] send: responded "started" to vitest`);
        });
        
        break;
      
      // this happens BEFORE stop() is called (stop() is for PoolWorker, "stop" is for thread)
      case 'stop':
        setImmediate(async () => {
          await this.stopThread();
          this.notifyVitest('stopped');
        });
        break;
      
      case 'cancel':
        debug(`[${this.logModuleWithId}] send: got "cancel" unexpectedly`, message);
        break;
      
      case 'collect':
      case 'run':
        this.currentWorkerId = message.context.workerId;
        this.threadSpecs = message.context.files.map((fileSpec): ThreadSpec => ({
          file: createInitialFileTask(
            toForwardSlash(fileSpec.filepath),
            this.config!.name ?? '',
            this.config!.root,
            this.config!.testTimeout,
            this.config!.retry
          )
        }));

        debug(`[${this.logModuleWithId}] send: vitest sent "${message.type}" message`
          + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
        );

        setImmediate(async () => {
          debug(`[${this.logModuleWithId}] send: dispatched "${message.type}" job to worker thread`
            + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
          );
          
          this.threadRunPromise = this.orchestrateFileRuns();

          try {
            await this.threadRunPromise;
            this.notifyVitest('testfileFinished');
            debug(`[${this.logModuleWithId}] send: responded "testfileFinished" to vitest`
              + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
            );

            this.threadSpecs = [];
          } catch (error) {
            // abort errors are expected, otherwise rethrow
            if (!isAbortError(error)) {
              throw error;
            }
          } finally {
            this.threadControlPort?.close();
            this.threadAbortController = undefined;
            this.threadControlPort = undefined;
            this.threadRunPromise = undefined;
          }
        });
        break;
    }
  }

  on(event: string, callback: EventCallback): void {
    this.addEventCallback(event, callback);
    debug(`[${this.logModuleWithId}] ON "${event}" - saved listener`);
  }

  off(event: string, callback: EventCallback): void {
    if (this.removeEventCallback(event, callback)) {
      debug(`[${this.logModuleWithId}] OFF "${event}" - removed callback from registry`);
    } else {
      debug(`[${this.logModuleWithId}] OFF "${event}" - callback not found in registry`);
    }
  }

  deserialize(data: unknown): unknown {
    return data;
  }

  canReuse(_task: PoolTask): boolean {
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Thread Pool Management
  // ─────────────────────────────────────────────────────────────────────────────

  private async getGlobalThreadPools(): Promise<GlobalThreadPools> {
    if (GLOBAL_POOLS_PROMISE) {
      return GLOBAL_POOLS_PROMISE;
    }

    GLOBAL_POOLS_PROMISE = new Promise<GlobalThreadPools>(async (resolve, _reject) => {
      const parallelism = availableParallelism();

      // TODO - decide which is better when scaling
      // Empirical observations show that near-minimum parallelization for compilation
      // tends to *dramatically* improve compilation times because of v8 warmup on repeated calls to asc.main,
      // so much so that this time savings **almost always** outweighs the benefits of spreading over many
      // available threads. The **almost** is the key word here- this needs to be tested on platforms with
      // higher available parallelism (> 8) to see if it holds true.
      const compileThreads = parallelism > 1 ? 2 : 1;

      debug(`[${this.logModuleWithId}] Creating global compile thread pool | ${compileThreads} max concurrent threads`);
      
      const start = performance.now();
      
      const compilePool = new Tinypool({
        filename: COMPILE_WORKER_PATH,
        minThreads: 1,
        maxThreads: compileThreads,
        isolateWorkers: false,
        idleTimeout: POOL_THREAD_IDLE_TIMEOUT_MS,
        env: this.poolOptions.env as Record<string, string>,
        execArgv: this.poolOptions.execArgv,
        workerData: {
          asCoverageOptions: this.asCoverageOptions,
        } satisfies WorkerThreadInitData
      });

      debug(`[${this.logModuleWithId}] Creating global run thread pool | ${parallelism} max concurrent threads`);

      const runPool = new Tinypool({
        filename: TEST_WORKER_PATH,
        minThreads: 1,
        maxThreads: parallelism,
        isolateWorkers: false,
        idleTimeout: POOL_THREAD_IDLE_TIMEOUT_MS,
        env: this.poolOptions.env as Record<string, string>,
        execArgv: this.poolOptions.execArgv,
        workerData: {
          asCoverageOptions: this.asCoverageOptions,
        } satisfies WorkerThreadInitData
      });

      debug(`[${this.logModuleWithId}] Created global thread pools in ${(performance.now() - start).toFixed(2)} ms`);

      GLOBAL_POOL_ABORT_CONTROLLER = new AbortController();
      resolve({ compilePool, runPool });
    });
    
    return GLOBAL_POOLS_PROMISE;
  }

  // @ts-ignore
  // pools are never explicitly destroyed.
  // - vitest processes are short-lived
  // - when PoolWorkers are stopped, they cleanup actively-running thread tasks
  // - in practice stop happens after every run, even in watch mode
  // - keeping pools hot is desirable for watch mode re-runs, so we maintain our pools
  private async destroyGlobalPoolsIfNeeded(): Promise<void> {
    if (GLOBAL_RUNNING_POOLWORKER_COUNT === 0 && GLOBAL_POOLS_PROMISE) {
      const destroyStart = performance.now();
      debug(`[${this.logModuleWithId}] Destroying Tinypools...`);

      try {
        const { compilePool, runPool } = await GLOBAL_POOLS_PROMISE;
        await Promise.all([ compilePool.destroy(), runPool.destroy() ]);
      } catch {}

      GLOBAL_POOLS_PROMISE = undefined;
      GLOBAL_POOL_ABORT_CONTROLLER = undefined;

      debug(`[${this.logModuleWithId}] Destroyed tinypools in ${(performance.now() - destroyStart).toFixed(2)} ms`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Listener Registry Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private getEventCallbacks(event: string): Set<EventCallback> {
    let callbacks: Set<EventCallback> | undefined = this.listenerRegistry.get(event);
    if (!callbacks) {
      callbacks = new Set<EventCallback>();
      this.listenerRegistry.set(event, callbacks);
    }
    return callbacks;
  }

  private addEventCallback(event: string, callback: EventCallback): void {
    this.getEventCallbacks(event).add(callback);
  }
  
  private removeEventCallback(event: string, callback: EventCallback): boolean {
    const callbacks = this.getEventCallbacks(event);
    if (callbacks) {
      return callbacks.delete(callback);
    } else {
      return false;
    }
  }

  private notifyVitest(responseType: WorkerResponse['type']): void {
    const messageCallbacks = this.getEventCallbacks('message');
    for (const cb of messageCallbacks) {
      cb({ type: responseType, [VITEST_WORKER_RESPONSE_MSG_FLAG]: true } satisfies WorkerResponse)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Worker Thread Control/Orchestration
  // ─────────────────────────────────────────────────────────────────────────────
  
  private async dispatchCompile(
    spec: ThreadSpec,
    compilePool: Tinypool,
  ): Promise<void> {
    const { workerPort, poolPort } = createWorkerRPCChannel(this.poolOptions.project, this.isCollectTestsMode);
    
    const compilePromise: Promise<ThreadSpec> = compilePool.run({
      dispatchStart: Date.now(),
      workerId: this.currentWorkerId!,
      port: workerPort,
      file: spec.file,
      config: this.config!,
      asPoolOptions: this.asPoolOptions,
      isCollectTestsMode: this.isCollectTestsMode,
    } satisfies RunCompileAndDiscoverTask, {
      name: 'runCompileAndDiscoverSpec',
      transferList: [workerPort],
      signal: GLOBAL_POOL_ABORT_CONTROLLER!.signal,
    });

    try {
      const { compilation, file } = await compilePromise;
      spec.file = file;
      spec.compilation = compilation;
    } finally {
      poolPort.close();
    }
  }
  
  private async dispatchRunTests(
    spec: ThreadSpec,
    runPool: Tinypool,
    timedOutTest?: Test,
  ): Promise<void> {
    const { workerPort, poolPort } = createWorkerRPCChannel(this.poolOptions.project, this.isCollectTestsMode);
    
    this.threadAbortController = new AbortController();
    this.threadControlPort = poolPort;
    this.threadControlPort.on('message', this.getWorkerThreadMessageHandler());

    const runPromise: Promise<void> = !spec.compilation ? Promise.resolve() : runPool.run({
      dispatchStart: Date.now(),
      workerId: this.currentWorkerId!,
      port: workerPort,
      file: timedOutTest?.file ?? spec.file,
      compilation: spec.compilation,
      config: this.config!,
      asPoolOptions: this.asPoolOptions,
      isCollectTestsMode: this.isCollectTestsMode,
      timedOutTest,
    } satisfies RunTestsTask, {
      name: 'runFileSpec',
      transferList: [workerPort],
      signal: AbortSignal.any([this.threadAbortController.signal, GLOBAL_POOL_ABORT_CONTROLLER!.signal]),
    });

    try {
      return await runPromise;
    } finally {
      this.threadControlPort.close();
      this.threadControlPort = undefined;
    }
  }

  private async orchestrateFileRuns(timedOutTest?: Test): Promise<void> {
    const modeStr = this.isCollectTestsMode ? 'collectTests' : 'runTests';
    const isResume: boolean = !!timedOutTest;
    const desc = `${modeStr} ${isResume ? '(RESUME)' : '(INITIAL)'}`;

    debug(`[${this.logModuleWithId}] orchestrateFileRuns: dispatching ${desc} to worker thread`
      + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
    );

    const { compilePool, runPool } = await this.getGlobalThreadPools();

    // compile file
    if (!isResume) {
      for (const spec of this.threadSpecs) {
        await this.dispatchCompile(spec, compilePool);
      }
    }

    // execute tests
    if (!this.isCollectTestsMode) {
      // usually there is only one thread spec (file) provided at a time, except for when
      // maxWorkers = 1 and isolate = false in the vitest project config, in which case we
      // get multiple threadspecs here all at once
      for (const spec of this.threadSpecs) {
        const specTimedOutTest = timedOutTest?.file.filepath === spec.file.filepath ? timedOutTest : undefined;
        await this.dispatchRunTests(spec, runPool, specTimedOutTest);
      }
    }

    debug(`[${this.logModuleWithId}] orchestrateFileRuns: ${desc} thread work complete`
      + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
    );
  }

  private async stopThread(): Promise<void> {
    this.clearTestTimeoutTimer(); // if any
    this.currentTestRun = undefined;
    
    const mod = this.logModuleWithId;
    const start = performance.now();

    debug('setting graceful resolve timeout');
    const abortTimeout = setTimeout(() => {
      debug(`[${mod}] stop: timed out waiting on pool worker run resolve ${(performance.now() - start).toFixed(2)} ms | Aborting thread`);
      this.threadAbortController?.abort();
    }, THREAD_RESOLVE_TIMEOUT_MS);
      
    try {
      debug(`[${mod}] stop: awaiting pool worker run resolve: ${!!this.threadRunPromise}`);
      await this.threadRunPromise;
      clearTimeout(abortTimeout);
      debug(`[${this.logModuleWithId}] stop: pool worker run resolved cleanly after ${(performance.now() - start).toFixed(2)} ms`);
    } catch {
    } finally {
      this.threadControlPort?.close();
      debug(`[${this.logModuleWithId}] stop: closed pool port`);
    }
    
    this.threadAbortController = undefined;
    this.threadControlPort = undefined;
    this.threadRunPromise = undefined;
    this.threadSpecs = [];
  }

  private getWorkerThreadMessageHandler(): EventCallback {
    return (message: any): void => {
      if (message[AS_POOL_WORKER_MSG_FLAG]) {
        const poolMessage = message as AssemblyScriptPoolWorkerMessage;

        switch (poolMessage.type) {
          case 'execution-start':
            this.handleTestExecutionStart(message);
            break;
          case 'execution-end':
            this.handleTestExecutionEnd(message);
            break;
        }

        return;
      }
    };
  }

  private handleTestExecutionStart(msg: TestExecutionStart): void {
    if (!this.isWorkerRunning) return;
    
    const { executionStart, test } = msg;
    const now = Date.now();
    const transitDuration = now - executionStart;
    const adjustedTimeout = Math.max(test.timeout - transitDuration, 0);

    this.currentTestRun = {
      test,
      executionStart,
      timeoutId: setTimeout(() => this.handleTimeout(), adjustedTimeout)
    };

    debug(`[${this.logModuleWithId}] START test timeout timer for "${this.currentTestRun.test.name}"`);
  }

  private handleTestExecutionEnd(_msg: TestExecutionEnd): void {
    this.clearTestTimeoutTimer();
    this.currentTestRun = undefined;
  }

  private clearTestTimeoutTimer(): void {
    if (this.currentTestRun) {
      const elapsed = Date.now() - this.currentTestRun.executionStart;
      debug(`[${this.logModuleWithId}] CLEAR test timeout timer (${elapsed.toFixed(2)} ms) for "${this.currentTestRun?.test.name}"`);
      clearTimeout(this.currentTestRun.timeoutId);
    }
  }

  private async handleTimeout(): Promise<void> {
    if (!this.isWorkerRunning) return;

    if (!this.threadSpecs.length || !this.currentTestRun || !this.currentTestRun.test) {
      const missingStr = 
        + (this.threadSpecs.length ? '' : 'threadSpecs')
        + (this.currentTestRun ? '' : ' currentTestRecord')
        + (this.currentTestRun?.test ? '' : ' currentTestRecord.test')
      throw createPoolError(
        POOL_ERROR_NAMES.PoolError,
        `Cannot timeout/resume worker thread for workerId ${this.currentWorkerId} - missing data: ${missingStr}`
      );
    }

    const duration = Date.now() - this.currentTestRun.executionStart;
    failTestWithTimeoutError(this.currentTestRun.test, this.currentTestRun.executionStart, duration);

    // set termination time metadata for measuring resume latency
    flagTestTerminated(this.currentTestRun.test);

    debug(`[${this.logModuleWithId}] handleTimeout: TEST TIMEOUT "${this.currentTestRun.test.name}" after ${duration.toFixed(2)} ms`
      +` - Terminating worker thread job`
    );

    const termStart = performance.now();
    
    try {
      this.threadAbortController?.abort();
      await this.threadRunPromise;
    } catch (error) {
      // abort errors are expected, otherwise rethrow
      if (!isAbortError(error)) {
        throw error;
      }
    } finally {
      this.threadControlPort?.close();
      this.threadAbortController = undefined;
      this.threadControlPort = undefined;
      this.threadRunPromise = undefined;
    }

    debug(`[${this.logModuleWithId}] handleTimeout: Worker thread job aborted for timeout in ${(performance.now() - termStart).toFixed(2)} ms`);
    
    if (!this.isWorkerRunning) return;

    // supply timed-out test (includes entire file hierarchy & coverage)
    // to resume testing where we leftoff when aborting for timeout
    this.threadRunPromise = this.orchestrateFileRuns(this.currentTestRun.test);

    debug(`[${this.logModuleWithId}] handleTimeout: re-dispatched job to worker thread`
      + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
    );

    try {
      await this.threadRunPromise;
      this.notifyVitest('testfileFinished');
      debug(`[${this.logModuleWithId}] handleTimeout: file run completed - responded "testfileFinished" to vitest`
        + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
      );
      
      this.threadSpecs = [];
    } catch (error) {
      // abort errors are expected, otherwise rethrow
      if (!isAbortError(error)) {
        throw error;
      } else {
        debug(`[${this.logModuleWithId}] send: caught and ignored timeout awaiting timeout re-run`
          + ` | files: "${this.threadSpecs.map(s => s.file.filepath).join(',')}"`
        );
      }
    } finally {
      //@ts-ignore
      this.threadControlPort?.close();
      this.threadControlPort = undefined;
      this.threadAbortController = undefined;
      this.threadRunPromise = undefined;
    }
  }

  private get logModuleWithId(): string {
    return `${this.logModule}${this.currentWorkerId === undefined ? '' : ` ${this.currentWorkerId}`}`;
  }
}
