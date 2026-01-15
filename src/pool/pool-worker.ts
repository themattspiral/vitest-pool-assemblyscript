import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs'
import type { PoolWorker, PoolOptions, WorkerRequest, PoolTask } from 'vitest/node';

import type {
  AssemblyScriptPoolWorkerMessage,
  ResolvedAssemblyScriptPoolOptions,
  ResolvedHybridProviderOptions,
  TestExecutionEnd,
  TestExecutionStart,
  TestFileCompiled,
  TestRunRecord,
  WASMCompilation,
  WorkerThreadInitData,
  WorkerThreadResumeContext,
} from '../types/types.js';
import { failTestWithTimeoutError, prepareForTermination } from '../util/vitest-tasks.js';
import { AS_POOL_WORKER_MSG_FLAG, ASSEMBLYSCRIPT_POOL_NAME, POOL_ERROR_NAMES } from '../types/constants.js';
import { debug, setDebugMode } from '../util/debug.js';
import { createPoolError } from '../util/pool-errors.js';

const WORKER_PATH = resolve(import.meta.dirname, 'pool-thread/worker-thread.mjs');

/** Callback function type for event listeners */
type EventCallback = (arg: any) => void;

export class AssemblyScriptPoolWorker implements PoolWorker {
  readonly name: typeof ASSEMBLYSCRIPT_POOL_NAME = ASSEMBLYSCRIPT_POOL_NAME;
  readonly poolOptions: PoolOptions;
  readonly asPoolOptions: ResolvedAssemblyScriptPoolOptions;
  readonly asCoverageOptions: ResolvedHybridProviderOptions;

  private readonly logModule = 'PoolWorker' as const;

  private thread: Worker | undefined;
  private swapThread: Worker | undefined;
  private swapThreadStarted: Promise<void> | undefined;
  private isStopped: boolean = true;

  /**
   * Registry mapping vitest callbacks to our wrapper callbacks.
   * Structure: eventName -> (vitestCallback -> ourWrapper)
   *
   * This enables proper on/off handling when we intercept events:
   * - vitest calls on('exit', cb) -> we register wrapper, store cb->wrapper mapping
   * - vitest calls off('exit', cb) -> we look up wrapper, remove it from thread
   */
  private listenerRegistry = new Map<string, Map<EventCallback, EventCallback>>();

  /**
   * Flag to suppress exit events during timeout recovery.
   * Set true BEFORE terminating worker, cleared after new worker starts.
   * Prevents vitest's unexpected-exit handler from firing during intentional restart.
   */
  private suppressExitEvents = false;

  // cached data for possible timeout resume
  private currentTestRun: TestRunRecord | undefined;
  private currentCompilation: WASMCompilation | undefined;
  private lastStartMessage: (WorkerRequest & { type: 'start' }) | undefined;
  private lastRunMessage: (WorkerRequest & { type: 'run' }) | undefined;
  private currentWorkerId: number | undefined;

  constructor(
    options: PoolOptions,
    resolvedUserPoolOptions: ResolvedAssemblyScriptPoolOptions,
    resolvedCoverageOptions: ResolvedHybridProviderOptions,
  ) {
    this.poolOptions = options;
    this.asPoolOptions = resolvedUserPoolOptions;
    this.asCoverageOptions = resolvedCoverageOptions;

    if (!existsSync(WORKER_PATH)) {
      throw new Error(`Cannot find worker file at path: "${WORKER_PATH}"`);
    }
    
    setDebugMode(this.asPoolOptions.debug);
    debug(`[${this.logModule}] Created AssemblyScriptPoolWorker | method: "${this.poolOptions.method}"`
      + ` | project: "${this.poolOptions.project.name}"`
    );
  }

  async start(): Promise<void> {
    let primaryCreatedTime: number | undefined;

    if (!this.thread) {
      const start = performance.now();
      const workerData: WorkerThreadInitData = { asPoolOptions: this.asPoolOptions, asCoverageOptions: this.asCoverageOptions };
      this.thread = new Worker(WORKER_PATH, {
        env: this.poolOptions.env,
        execArgv: this.poolOptions.execArgv,
        workerData,
      });
      primaryCreatedTime = performance.now() - start;
    }

    debug(() => {
      const createStr = primaryCreatedTime === undefined
        ? 'Using Swapped Worker Thread'
        : `Created Primary Worker Thread in ${(primaryCreatedTime.toFixed(2))} ms`;
      const resumeStr = this.currentTestRun
        ? `Resuming after test timeout on "${this.currentTestRun.test.name}" from worker ${this.lastStartMessage?.workerId}`
        : 'Initial run';
      return `[${this.logModuleWithId}] start: ${createStr} | threadId: ${this.thread?.threadId} | ${resumeStr}`;
    });
    
    // Re-register all listeners on the new thread
    const regStart = performance.now();
    this.registerCachedListenersOnPrimaryThread();
    debug(`[${this.logModuleWithId}] start: registered cached listeners in ${(performance.now() - regStart).toFixed(2)} ms`
      + ` | threadId: ${this.thread?.threadId}`
    );

    if (!this.swapThread) {
      const start = performance.now();
      const workerData: WorkerThreadInitData = { asPoolOptions: this.asPoolOptions, asCoverageOptions: this.asCoverageOptions };
      this.swapThread = new Worker(WORKER_PATH, {
        env: this.poolOptions.env,
        execArgv: this.poolOptions.execArgv,
        workerData,
      });
      debug(`[${this.logModuleWithId}] start: Created Timeout Swap Thread in ${(performance.now() - start).toFixed(2)} ms`
        + ` | threadId: ${this.swapThread.threadId}`
      );

      if (this.lastStartMessage) {
        this.sendCachedStartToTimeoutSwapThread();
      }
    } else {
      debug(`[${this.logModuleWithId}] start: WARNING Swap thread already exists! | threadId: ${this.swapThread.threadId}`);
    }
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    this.clearTimeoutTimer(); // if any
    debug(`[${this.logModuleWithId}] stop`);

    const primaryId = this.thread?.threadId;
    const swapId = this.swapThread?.threadId;

    const start = performance.now();
    debug(`[${this.logModuleWithId}] stop: Terminating Worker Threads | primary threadId: ${primaryId}`
      + ` | timeout swap threadId: ${swapId}`
    );

    await Promise.all([
      this.thread ? this.thread.terminate() : Promise.resolve(),
      this.swapThread ? this.swapThread.terminate() : Promise.resolve(),
    ]);

    debug(`[${this.logModuleWithId}] stop: Terminated Worker Threads in ${(performance.now() - start).toFixed(2)} ms`
      + `  | primary threadId: ${primaryId} | timeout swap threadId: ${swapId}`
    );

    this.thread = undefined;
    this.swapThread = undefined;
    this.swapThreadStarted = undefined;
    this.currentTestRun = undefined;
    this.currentCompilation = undefined;
    this.lastStartMessage = undefined;
    this.lastRunMessage = undefined;

    // Clear listener registry on permanent stop
    this.listenerRegistry.clear();

    debug(`[${this.logModuleWithId}] AssemblyScriptPoolWorker stopped`);
    this.currentWorkerId = undefined;
  }

  send(message: WorkerRequest): void {
    // Capture start message for potential restart
    if (message.__vitest_worker_request__ && message.type === 'start') {
      this.currentWorkerId = message.workerId;
      this.lastStartMessage = message;
      this.isStopped = false;

      debug(`[${this.logModuleWithId}] Captured last 'start' message from vitest`);

      if (this.swapThread) {
        this.sendCachedStartToTimeoutSwapThread();
      }
      
    } else if (message.__vitest_worker_request__ && message.type === 'run') {
      this.currentWorkerId = message.context.workerId;
      this.lastRunMessage = message;

      let oldId: number | undefined;
      if (this.lastStartMessage) {
        oldId = this.lastStartMessage.workerId;
        this.lastStartMessage.workerId = this.currentWorkerId;
      }

      const idStr = oldId === this.currentWorkerId
        ? `start/resume workerId ${this.currentWorkerId}`
        : `reusing worker with new workerId: ${oldId} → ${this.currentWorkerId}`;
      debug(`[${this.logModuleWithId}] Captured last 'run' message from vitest | ${idStr}`);
    }

    this.thread?.postMessage(message);
  }

  on(event: string, callback: EventCallback): void {
    const registry = this.getEventRegistry(event);

    let wrapper: EventCallback;
    if (event === 'exit') {
      wrapper = this.createExitWrapper(callback);
    } else if (event === 'message') {
      wrapper = this.createMessageWrapper(callback);
    } else {
      wrapper = callback; // No wrapping needed for other events (e.g. 'error')
    }

    registry.set(callback, wrapper);
    this.thread?.on(event, wrapper);

    debug(`[${this.logModuleWithId}] ON "${event}" - registered ${callback === wrapper ? 'direct' : 'wrapped'} listener`);
  }

  off(event: string, callback: EventCallback): void {
    const registry = this.listenerRegistry.get(event);
    if (!registry) {
      debug(`[${this.logModuleWithId}] OFF "${event}" - no registry for event`);
      return;
    }

    const wrapper = registry.get(callback);
    if (wrapper) {
      this.thread?.off(event, wrapper);
      registry.delete(callback);
      debug(`[${this.logModuleWithId}] OFF "${event}" - removed wrapper from registry`);
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
  // Listener Registry Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /** Get or create the callback registry for a specific event type */
  private getEventRegistry(event: string): Map<EventCallback, EventCallback> {
    let registry = this.listenerRegistry.get(event);
    if (!registry) {
      registry = new Map();
      this.listenerRegistry.set(event, registry);
    }
    return registry;
  }

  /**
   * Create wrapper for 'exit' events that conditionally forwards to vitest.
   * Suppresses exit events during timeout recovery to prevent vitest's
   * unexpected-exit handler from firing when we intentionally restart.
   */
  private createExitWrapper(callback: EventCallback): EventCallback {
    return (exitCode: any) => {
      if (this.suppressExitEvents) {
        debug(`[${this.logModuleWithId}] Suppressing exit event during timeout recovery (exitCode: ${exitCode})`);
        return;
      }
      debug(`[${this.logModuleWithId}] Forwarding exit event to vitest (exitCode: ${exitCode})`);
      callback(exitCode);
    };
  }

  /**
   * Create wrapper for 'message' events that intercepts our custom protocol
   * messages and forwards vitest messages to the original callback.
   */
  private createMessageWrapper(callback: EventCallback): EventCallback {
    return (message: any) => {
      // Handle our custom protocol messages
      if (message[AS_POOL_WORKER_MSG_FLAG]) {
        const poolMessage = message as AssemblyScriptPoolWorkerMessage;

        switch (poolMessage.type) {
          case 'file-compiled':
            this.handleFileCompiled(message);
            break;
          case 'execution-start':
            this.handleExecutionStart(message);
            break;
          case 'execution-end':
            this.handleExecutionEnd(message);
            break;
        }
        return; // Don't forward to vitest
      }

      // Forward to vitest
      callback(message);
    };
  }

  /**
   * Re-register all listeners on the current thread.
   * Called after creating a new Worker (initial start - does nothing,
   * or restart after timeout - critical)
   */
  // @ts-ignore
  private registerCachedListenersOnPrimaryThread(): void {
    for (const [event, registry] of this.listenerRegistry) {
      for (const [_vitestCallback, wrapper] of registry) {
        this.thread?.on(event, wrapper);
      }
      debug(`[${this.logModuleWithId}] Re-registered ${registry.size} "${event}" listener(s) on new thread`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Custom Protocol Message Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  private sendCachedStartToTimeoutSwapThread() {
    const startSentAt = performance.now();
        
    this.swapThreadStarted = new Promise<void>((resolve) => {
      const startedListener = (msg: any) => {
        if (msg?.__vitest_worker_response__ && msg.type === 'started') {
          debug(`[${this.logModuleWithId}] Received "start" confirmation from timeout swap thread in`
            + ` ${(performance.now() - startSentAt).toFixed(2)} ms | threadId: ${this.swapThread?.threadId}`
          );
          this.swapThread?.off('message', startedListener);
          resolve();
        }
      };
      this.swapThread?.on('message', startedListener);
    });

    this.swapThread?.postMessage(this.lastStartMessage);
    debug(`[${this.logModuleWithId}] Sent "start" to timeout swap thread | threadId ${this.swapThread?.threadId}`);
  }

  private handleFileCompiled(msg: TestFileCompiled): void {
    this.currentCompilation = msg.compilation;
    debug(`[${this.logModuleWithId}] Received worker file compilation for "${this.currentCompilation.filePath}"`);
  }

  private handleExecutionStart(msg: TestExecutionStart): void {
    if (this.isStopped) return;
    
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

  private handleExecutionEnd(_msg: TestExecutionEnd): void {
    this.clearTimeoutTimer();
    this.currentTestRun = undefined;
  }

  private clearTimeoutTimer(): void {
    if (this.currentTestRun) {
      const elapsed = Date.now() - this.currentTestRun.executionStart;
      debug(`[${this.logModuleWithId}] CLEAR test timeout timer (${elapsed.toFixed(2)} ms) for "${this.currentTestRun?.test.name}"`);
      clearTimeout(this.currentTestRun.timeoutId);
    }
  }

  private async handleTimeout(): Promise<void> {
    if (this.isStopped) return;

    if (!this.currentTestRun || !this.currentTestRun.test || !this.currentCompilation || !this.lastStartMessage || !this.lastRunMessage) {
      const missingStr = (this.currentTestRun ? '' : 'currentTestRecord')
        + (this.currentTestRun?.test ? '' : ' currentTestRecord.test')
        + (this.currentCompilation ? '' : ' currentCompilation')
        + (this.lastStartMessage ? '' : ' lastStartMessage')
        + (this.lastRunMessage ? '' : ' lastRunMessage');
      throw createPoolError(
        `Cannot timeout/resume worker thread for workerId ${this.currentWorkerId} - missing data: ${missingStr}`,
        POOL_ERROR_NAMES.PoolError
      );
    }

    const duration = Date.now() - this.currentTestRun.executionStart;
    failTestWithTimeoutError(this.currentTestRun.test, this.currentTestRun.executionStart, duration);

    // set termination time metadata for measuring resume latency
    prepareForTermination(this.currentTestRun.test);

    // supply timed-out test (includes entire file hierarchy & coverage)
    // and cached compiled files with the run request which will resume testing
    const runWithTimeoutContext: WorkerRequest & { type: 'run' } = { ...this.lastRunMessage };
    const resumeContext: WorkerThreadResumeContext = {
      timedOutTest: this.currentTestRun.test,
      timedOutCompilation: this.currentCompilation,
      runResentTime: 0
    };
    runWithTimeoutContext.context.providedContext = resumeContext;

    // Suppress exit events before terminating to prevent vitest's unexpected-exit handler
    this.suppressExitEvents = true;

    const termThreadId = this.thread?.threadId;
    debug(`[${this.logModuleWithId}] TEST TIMEOUT "${resumeContext.timedOutTest.name}" after ${duration.toFixed(2)} ms`
      +` - Terminating worker thread | threadId: ${termThreadId}`
    );
    const termStart = performance.now();
    await this.thread?.terminate();
    this.thread = undefined;

    debug(`[${this.logModuleWithId}] Primary worker thread terminated for timeout in ${(performance.now() - termStart).toFixed(2)} ms`
      + ` | threadId: ${termThreadId}`
    );

    const swapStartWaitStart = performance.now();
    await this.swapThreadStarted;
    this.thread = this.swapThread;
    this.swapThread = undefined;
    this.swapThreadStarted = undefined;
    debug(`[${this.logModuleWithId}] Timeout swap thread is now primary after ${(performance.now() - swapStartWaitStart).toFixed(2)} ms`
      + ` | threadId: ${this.thread?.threadId}`
    );

    const callStart = performance.now();
    // re-register all listeners on swapped thread, create new swap thread and send cached "start" to it async
    await this.start();
    debug(`[${this.logModuleWithId}] Re-initialized primary thread and created new timeout swap worker in ${(performance.now() - callStart).toFixed(2)} ms`);
    
    // Safe to allow exit events again now that new thread is running
    this.suppressExitEvents = false;

    // send vitest run message
    const runStart = performance.now();
    resumeContext.runResentTime = Date.now();

    this.thread!.postMessage(runWithTimeoutContext);
    debug(`[${this.logModuleWithId}] Sent "run" to resumed primary worker thread in ${(performance.now() - runStart).toFixed(2)} ms`
      + ` with timed out test "${resumeContext.timedOutTest.name}"`
    );
  }

  private get logModuleWithId(): string {
    return `${this.logModule}${this.currentWorkerId === undefined ? '' : ` ${this.currentWorkerId}`}`;
  }
}
