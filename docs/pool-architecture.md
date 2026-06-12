# Pool Architecture

This document describes the internal architecture of `vitest-pool-assemblyscript` for contributors and maintainers. It covers how the pool integrates with vitest, how test files are compiled and executed, how errors and coverage are handled, and the rationale behind key design decisions.

The primary architecture targets **vitest 5.x (and 4.x)** using the `PoolWorker` API. Vitest 3.x compatibility is maintained via a separate orchestration layer that shares the same underlying runners and execution engine — see [Vitest 3 Compatibility](#vitest-3-compatibility).

---

**Table of Contents**
- [High-Level Architecture](#high-level-architecture)
- [Dual Thread Pool Architecture](#dual-thread-pool-architecture)
- [Execution Pipeline](#execution-pipeline)
- [WASM Execution & Isolation](#wasm-execution--isolation)
- [Error Handling & Source Mapping](#error-handling--source-mapping)
- [Timeout Architecture](#timeout-architecture)
- [RPC Communication](#rpc-communication)
- [Coverage Architecture Summary](#coverage-architecture-summary)
- [Native Build & Distribution](#native-build--distribution)
- [CI/CD Pipeline](#cicd-pipeline)
- [Vitest 3 Compatibility](#vitest-3-compatibility)

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Vitest Core (Node.js)                           │
│          Test Discovery, Watch Mode, UI, Reporters                   │
│                                                                      │
│  Creates a NEW AssemblyScriptPoolWorker for each file task,          │
│  running at most maxWorkers PoolWorkers concurrently                 │
└───────────┬──────────────────────────────────────────────────────────┘
            │  PoolWorker interface (start/stop/send/on/off)
            ↓
┌──────────────────────────────────────────────────────────────────────┐
│   AssemblyScriptPoolWorker (1 per file task, ≤ maxWorkers active)    │
│                     src/pool/pool-worker.ts                          │
│                                                                      │
│  • Receives file specs from vitest via send() messages               │
│  • Dispatches compilation and test execution to global thread pools  │
│  • Enforces test timeouts from the main thread                       │
│  • Manages timeout abort + resume with state preservation            │
│  • Only one active dispatch (compile or test-run) at a time          │
│                                                                      │
│  Each PoolWorker runs one dispatch at a time — parallelism comes     │
│  from vitest running up to maxWorkers PoolWorkers at once, each      │
│  dispatching to the shared global thread pools.                      │
└───────────┬──────────────────────────────────────────────────────────┘
            │  Tinypool task dispatch
            ↓
┌──────────────────────────────────────────────────────────────────────┐
│                 Global Thread Pools (shared, singleton)              │
│                                                                      │
│  ┌─────────────────────────────┐  ┌──────────────────────────────┐   │
│  │  Compile Pool (2 threads)   │  │  Run Pool (core-count thrds) │   │
│  │  compile-worker-thread.ts   │  │  test-worker-thread.ts       │   │
│  │                             │  │                              │   │
│  │  runCompileAndDiscoverSpec  │  │  runFileSpec                 │   │
│  │   └─> compile-runner.ts     │  │   └─> test-runner.ts         │   │
│  │       runCompileAndDiscover │  │       runSuite / runTest     │   │
│  └─────────────────────────────┘  └──────────────────────────────┘   │
└───────────┬──────────────────────────────────────────────────────────┘
            │
            ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    WASM Executor (per test)                          │
│                   src/wasm-executor/                                 │
│                                                                      │
│  • Fresh WebAssembly.Instance per test (crash isolation)             │
│  • Import callbacks for test lifecycle, assertions, abort            │
│  • Multi-memory for coverage counters (Node 22+)                     │
│  • Source-mapped error enhancement                                   │
└───────────┬──────────────────────────────────────────────────────────┘
            │  onAfterSuiteRun (coverage data)
            ↓
┌──────────────────────────────────────────────────────────────────────┐
│              Hybrid Coverage Provider (once per run)                 │
│             src/coverage-provider/                                   │
│                                                                      │
│  • Accumulates AS coverage across all test files                     │
│  • Containment matching: binary hit points → source function ranges  │
│  • Converts to Istanbul format, merges with JS/TS v8 coverage        │
│  • Delegates report generation to vitest                             │
└──────────────────────────────────────────────────────────────────────┘
```

Vitest constructs a **new** `AssemblyScriptPoolWorker` for each file task and stops it when the task completes, keeping at most `maxWorkers` PoolWorkers active concurrently (each task normally carries one file — see the batching exception below). This is how parallelization is achieved: each PoolWorker drives one thread dispatch at a time (a compile or a test run), so the number of active PoolWorkers is the number of busy threads. PoolWorker instances are cheap to construct because the expensive resources — the global thread pools — are process-level singletons shared across all instances.

The thread pools are sized from the machine's core count (`availableParallelism()`), never from vitest config: pool size is lazily-spawned *capacity*, while vitest's scheduler — admitting at most `maxWorkers` concurrent file tasks — is the parallelism *governor*. One consequence: `maxWorkers` values above the core count are effectively clamped for AS test execution, because the excess file tasks queue on the run pool rather than oversubscribing the CPU.

**File batching exception:** with `isolate: false` and `maxWorkers: 1`, vitest batches all of a project's files into a *single* run message handled by a single PoolWorker. The PoolWorker processes the batch strictly one file at a time in **both** phases — compile dispatches and test-run dispatches each happen sequentially. The timeout enforcement machinery tracks a single active run (control port, abort controller, current test), and these dispatch loops are the *only* thing enforcing one-at-a-time execution — the thread pools are sized from core count and provide no backstop. See [Execution Pipeline](#execution-pipeline).

### PoolWorker Deviation from Standard Vitest Internal Pool Pattern

While `AssemblyScriptPoolWorker` implements vitest's `PoolWorker` interface (`start`/`stop`/`send`/`on`/`off`, plus `deserialize` and `canReuse` — the latter returns `true` so vitest reuses idle PoolWorker instances for subsequent files), it does **not** follow vitest's example pattern of having the PoolWorker act as a thin passthrough to a dedicated worker thread. Instead, the PoolWorker itself contains significant orchestration logic: it manages its own global thread pools, dispatches work to compile and run pool threads, enforces timeouts from the main thread, and handles abort + resume across thread boundaries.

This deviation is intentional. The standard passthrough model doesn't support our requirements:
- **Main-thread timeout enforcement**: WASM infinite loops block the worker thread's event loop, so timeouts must be enforced externally from the PoolWorker
- **Timeout resume**: After aborting a timed-out thread, the PoolWorker re-dispatches remaining work with preserved state — this requires orchestration logic that lives outside the worker threads
- **Custom thread pools**: We determined that using two specialized pools with different thread counts and lifetimes helps to optimize performance for WASM workloads (rather than a single 1:1 PoolWorker <-> worker thread). Note: We still **do not exceed** the `maxWorkers` number of ***active*** threads at any time - Each PoolWorker is only ever `await`-ing a single dispatch (compile or test-run) at a time, but having the pools allows for a faster and cleaner re-use and respawn mechanism.
- **Lean worker threads**: Keeping worker threads focused on *either* compilation *or* test execution (not both) also allows faster thread respawn after timeout aborts

### Vitest Integration Contract

The pool's contract with vitest:

**Expects from vitest:** `PoolWorker` lifecycle calls (`start`/`stop`), `WorkerRequest` messages containing file specs and config via `send()`, a `TestProject` with resolved configuration

**Provides to vitest:** Standard RPC reporting via `onQueued`, `onCollected`, `onTaskUpdate`, `onAfterSuiteRun` — all using vitest's task object types (`File`, `Suite`, `Test`). 
- Coverage data is gathered and reported to our hybrid coverage provider via `onAfterSuiteRun` in a pool-specific format, and then converted to Istanbul format in the hybrid coverage provider, and merged with the Istanbul-formatted coverage report from a delegated v8 coverage provider, to get the "hybrid" coverage report.
- In **collect-only mode** (vitest's test collection phase), the pool compiles and discovers tests but skips execution, returning the task tree via `onCollected` for vitest's UI and filtering.

**Key source files:**
- [`src/pool/pool-runner-init.ts`](../src/pool/pool-runner-init.ts) — `createAssemblyScriptPool()` factory, returns `PoolRunnerInitializer`
- [`src/pool/pool-worker.ts`](../src/pool/pool-worker.ts) — `AssemblyScriptPoolWorker` class implementing vitest's `PoolWorker` interface
- [`src/coverage-provider/hybrid-coverage-provider.ts`](../src/coverage-provider/hybrid-coverage-provider.ts) — `HybridCoverageProvider`, hybrid AS + JS/TS coverage

---

## Dual Thread Pool Architecture

The pool uses two separate global Tinypool instances rather than vitest's simpler 1:1 PoolWorker-to-WorkerThread model. This added complexity exists because compilation and test execution have fundamentally different threading characteristics.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Global Thread Pools (lazy-initialized singleton)                   │
│  Created by first PoolWorker, shared by all PoolWorker instances    │
│                                                                     │
│  ┌──────────────────────────────┐  ┌─────────────────────────────┐  │
│  │  Compile Pool                │  │  Run Pool                   │  │
│  │                              │  │                             │  │
│  │  Threads: 2 (intentional)   │  │  Threads: core count         │  │
│  │  Worker: compile-worker-     │  │  Worker: test-worker-       │  │
│  │          thread.ts           │  │          thread.ts          │  │
│  │                              │  │                             │  │
│  │  Calls:                      │  │  Calls:                     │  │
│  │   runCompileAndDiscoverSpec  │  │   runFileSpec               │  │
│  │    └─> compile-runner.ts     │  │    └─> test-runner.ts       │  │
│  │        compileAssemblyScript │  │        runSuite / runTest   │  │
│  │        executeWASMDiscovery  │  │        executeWASMTest      │  │
│  │                              │  │                             │  │
│  │  Init data:                  │  │  Init data:                 │  │
│  │   WorkerThreadInitData       │  │   WorkerThreadInitData      │  │
│  │   (poolOptions, coverage     │  │   (poolOptions, coverage    │  │
│  │    options, projectRoot)     │  │    options, projectRoot)    │  │
│  └──────────────────────────────┘  └─────────────────────────────┘  │
│                                                                     │
│  Lifecycle:                                                         │
│  • Created lazily on first PoolWorker dispatch                      │
│  • Persist for process lifetime (watch mode, single runs)           │
│  • Never explicitly destroyed — vitest processes are short-lived,   │
│    and keeping pools hot is desirable for watch mode re-runs        │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Two Pools?

**AssemblyScript compilation benefits enormously from V8 JIT warmup.** Repeated calls to `asc.main()` on the same thread show dramatic speedup — empirically, the time savings from V8 warmup on consecutive compilations almost always outweighs the benefits of spreading across many threads. A small dedicated compile pool (2 threads) means each thread compiles sequentially and gets maximum warmup benefit.

**Test execution doesn't benefit from warmup the same way.** Each test instantiates a fresh WASM module and runs in isolation. Test execution benefits from maximum parallelism — more threads means more tests running concurrently across files.

These two concerns have fundamentally different optimal thread counts, so they need separate pools. A single pool would force a compromise: either too few threads for test execution, or too many threads for compilation (destroying warmup benefits).

**The global pool pattern** means thread initialization overhead is paid once (not per PoolWorker), and threads stay warm across multiple vitest worker lifecycles and watch mode re-runs. Both pools are sized from `availableParallelism()` at creation — never from vitest config — so their sizes are deterministic regardless of which PoolWorker happens to create them first. The compile pool's 2-thread count is hardcoded based on empirical observations (dropping to 1 on single-core machines), with a note to test on higher-parallelism platforms (>8 cores) to verify the tradeoff holds.

**Key source:** [`src/pool/pool-worker.ts`](../src/pool/pool-worker.ts) — `getGlobalThreadPools()`

---

## Execution Pipeline

```
Time ──────────────────────────────────────────────────────────────────────>

PoolWorker A (file1, file2):
  [Compile+Discover file1] ──> [Run Suite file1 (t1, t2, t3)] ──>
  [Compile+Discover file2] ──> [Run Suite file2 (t4, t5)]     ──> done
   (compile pool thread)        (run pool thread)

PoolWorker B (file3):
  [Compile+Discover file3] ──> [Run Suite file3 (t6, t7, t8)] ──> done
   (compile pool thread)        (run pool thread)

                                 ↑ Tests within a file run sequentially
                                   inside a single runSuite() call
```

The pipeline is orchestrated by `orchestrateFileRuns()` in [`pool-worker.ts`](../src/pool/pool-worker.ts):

1. **Compile phase**: Files in the current run message (normally just one — see below) are compiled **one at a time** via `dispatchCompile()`, each dispatched to the compile pool. Each compile thread runs `runCompileAndDiscover()`, which compiles the AssemblyScript to WASM (with optional instrumentation via native addon), then discovers tests by instantiating the binary and executing `_start`. Compilation also applies the pool's compiler transforms — see [Compiler Transforms](#compiler-transforms).

2. **Test phase** (if not collect-only mode): Files are dispatched to the run pool **one at a time** via `dispatchRunTests()`. Each run thread calls `runSuite()`, which recursively walks the suite hierarchy (describe blocks) and executes each test via `runTest()`.

Tests within a file execute sequentially — parallelism comes from multiple PoolWorkers processing different files concurrently. This is a deliberate simplification from earlier architectures that dispatched individual tests to workers. Sequential per-file execution simplifies suite hierarchy management, coverage aggregation, and timeout resume logic.

### File Batching (Non-Isolated Single Worker)

Vitest normally sends one file per run message, so a PoolWorker's "batch" is a single file. The exception is `isolate: false` combined with `maxWorkers: 1`, where vitest sends **all** of a project's matching files to one PoolWorker in a single run message. The pipeline handles this case deliberately:

- **Both phases dispatch strictly sequentially** — compiles and test runs are each processed one file at a time (compile dispatches carry no timeout-tracking state and manage their RPC ports locally).
- **The dispatch loops alone enforce one-at-a-time execution** — the thread pools are sized from core count, not config, so they provide no backstop. The PoolWorker's main-thread timeout enforcement tracks a single active run (control port, abort controller, current test record); one-at-a-time dispatch is what guarantees a timeout always aborts the thread actually running the test.
- **On timeout resume**, the whole batch is re-dispatched: the timed-out test is passed only to the dispatch for its own file, completed files short-circuit via their finalized results, and not-yet-run files execute normally.

### Compiler Transforms

Compilation always registers the **deep-equals transform** ([`src/compiler/transforms/deep-equals.mts`](../src/compiler/transforms/deep-equals.mts)), which injects deep-equality comparison, runtime type-name, and stringify methods into user-defined classes — these power `toEqual`/`toStrictEqual` matching and the formatted values in assertion diffs (see [Matchers API](matchers-api.md)).

When the `stripInline` pool option is enabled (the default), the **strip-inline transform** ([`src/compiler/transforms/strip-inline.mts`](../src/compiler/transforms/strip-inline.mts)) removes `@inline` decorators so those functions are compiled as real functions — keeping them visible in coverage reports and ensuring source-mapped errors point to the correct lines.

Both are standard AS compiler `--transform` modules, loaded by file path from the compiled `dist/` output (transforms must be plain JavaScript when the AS compiler imports them — see [`src/compiler/index.ts`](../src/compiler/index.ts)).

**Key source files:**
- [`src/pool/pool-worker.ts`](../src/pool/pool-worker.ts) — `orchestrateFileRuns()`, `dispatchCompile()`, `dispatchRunTests()`
- [`src/pool-thread/runner/compile-runner.ts`](../src/pool-thread/runner/compile-runner.ts) — `runCompileAndDiscover()`
- [`src/pool-thread/runner/test-runner.ts`](../src/pool-thread/runner/test-runner.ts) — `runSuite()`, `runTest()`

---

## WASM Execution & Isolation

### Test Registration (Discovery)

Tests register themselves during WASM module instantiation — no query functions are needed.

1. User writes `test("name", () => { ... })` and `describe("suite", () => { ... })` in AssemblyScript
2. AS compiler compiles the test file to WASM with `--exportTable` and `--exportStart _start`
3. Worker instantiates WASM with import callbacks provided via the import object
4. Calling `_start()` executes all top-level code, including `test()` and `describe()` calls
5. Each `test()` invokes the `__register_test(namePtr, fnIndex, ...)` import callback, which creates a vitest `Test` task and adds it to the file's task hierarchy
6. Each `describe()` invokes `__begin_register_suite(namePtr, ...)` / `__end_register_suite()` to manage a suite stack, nesting tests within their parent suites

### Per-Test Crash Isolation

AssemblyScript has no try/catch — a runtime error (null dereference, out-of-bounds access) causes an unrecoverable WASM abort. Without isolation, one crashing test would kill all remaining tests in the file.

For each test execution:
1. Create a fresh `WebAssembly.Instance` from the compiled module (reusing the same compiled binary)
2. Provide fresh `WebAssembly.Memory` for test data
3. Call `_start()` to initialize module globals (test registration callbacks are stubbed/no-op during execution)
4. Execute the specific test function via the exported function table: `table.get(test.fnIndex)()`
5. If the test aborts, the thrown error is caught by the executor and reported — subsequent tests are unaffected because they get their own fresh instance

Instantiation overhead is minimal (~0.43ms per test) because `WebAssembly.compile()` is done once per file and the compiled module is reused.

### Import Callbacks (WASM → Node.js)

Pool-specific callbacks are declared in WASM via `@external("__as_pool_env__", "callbackName")`. Standard runtime imports (`abort`, `memory`, `__coverage_memory`) use the `env` module:

| Callback | Purpose |
|----------|---------|
| `__register_test(namePtr, fnIndex, timeout, retry, skip, only, fails)` | Register test during discovery (name + function table index + resolved test options) |
| `__begin_register_suite(namePtr, timeout, retry, skip, only, fails)` | Push new suite onto suite stack during discovery (with suite-level default options) |
| `__end_register_suite(namePtr)` | Pop suite from stack during discovery |
| `__assertion_pass()` | Increment passed assertion counter |
| `__assertion_fail(msgPtr, actualTypeNamePtr, expectedTypeNamePtr, valuesProvided, actualPtr?, expectedPtr?)` | Record failed assertion (message + typed actual/expected values for diff output) |
| `__expect_throw(fnIndex, expectedErrorMsgPtr?)` | `toThrowError` support: invoke the function expected to abort; the abort handler then matches the thrown message against the expected one |
| `__end_expect_throw()` | `toThrowError` support: reached only if no abort occurred — fails the test as "expected to throw" |
| `abort(msgPtr, filePtr, line, column)` | AS runtime abort handler — see [Error Handling](#error-handling--source-mapping) |
| `memory` | `WebAssembly.Memory` import — created in Node.js, shared with WASM via `--importMemory` |
| `__coverage_memory` | Separate `WebAssembly.Memory` for coverage counters (when instrumented) |

The registration callbacks (`__register_test`, `__begin/__end_register_suite`) are live during discovery and stubbed as no-ops during test execution; the assertion and throw-expectation callbacks are the reverse.

The `env` module additionally carries console-capture imports (so AssemblyScript `console.*` output is captured and reported to vitest), and any [user-provided WASM imports](providing-wasm-imports.md) (`wasmImportsFactory`) are merged in — user `env` entries can intentionally shadow the pool's console imports, and user-defined custom modules are passed through alongside.

Import callbacks cannot be tree-shaken by the AS compiler (they're external dependencies), which avoids the tree-shaking problems that affect other approaches to test function registration.

**Key source files:**
- [`src/wasm-executor/index.ts`](../src/wasm-executor/index.ts) — `executeWASMDiscovery()`, `executeWASMTest()`
- [`src/wasm-executor/wasm-imports.ts`](../src/wasm-executor/wasm-imports.ts) — `createDiscoveryImports()`, `createTestExecutionImports()`

---

## Error Handling & Source Mapping

AssemblyScript has no try/catch — all runtime errors (failed assertions, null dereferences, out-of-bounds access) result in a WASM abort. This means every error in user test code ultimately arrives through a single channel: the `abort()` import callback. The pool handles this uniformly but with context-specific behavior depending on whether the abort occurs during test discovery or test execution.

### WASM Abort Flow

The abort handler's behavior differs between discovery and test execution contexts:

**During discovery** (`_start` execution):
1. `abort()` import fires — decode abort info from WASM memory, extract V8 call stack containing WASM frames
2. Create a `PoolError` with `WASMExecutionAbortError` name, attaching the raw call stack and a `WASMRuntimeError` test error as the cause
3. Throw to halt WASM execution
4. `executeWASMDiscovery()` catches, calls `enhanceTestError()` to source-map the error, attaches enhanced error to the PoolError's cause
5. Runner catches the PoolError and calls `reportFileError()` — the entire file is marked as failed with the source-mapped error

**During test execution** (`table.get(fnIndex)()`):
1. `abort()` import fires — decode abort info, extract V8 call stack
2. Determine error type: `AssertionError` (from `__assertion_fail`) or `WASMRuntimeError` (runtime abort)
3. Call `failTest()` which stores the error on `test.meta.lastError` and the raw call stack on `test.meta.lastErrorRawCallStack`
4. Throw to halt WASM execution
5. `executeWASMTest()` catches the `WASMExecutionAbortError` (expected), then checks `meta.lastError`
6. Call `enhanceTestError()` to source-map the raw V8/WASM call stack to AssemblyScript source locations
7. Attach the enhanced error to `test.result.errors`

### Error Formatting for Vitest

`enhanceTestError()` in [`src/wasm-executor/wasm-errors.ts`](../src/wasm-executor/wasm-errors.ts) produces a test error with three key fields that vitest's reporters consume:

**`error.diff`** — Our primary visual output channel. Contains:
- For assertion errors: expected/actual diff (via `@vitest/utils/diff`) + primary stack frame + highlighted source code snippet
- For runtime errors: primary stack frame + highlighted source code snippet
- The primary stack frame is formatted in vitest's cyan style (e.g. ` ❯ functionName file.ts:10:5`)
- The source code snippet uses syntax highlighting and points to the error line

**`error.stacks`** — `ParsedStack[]` array containing all stack frames *except* the primary frame. Vitest renders these below the diff. Internal pool frames (assertion helpers, framework internals) are filtered out for cleaner output.

**`error.stack`** — A plaintext string used by vitest for **error deduplication across retries**, not for user-facing display. For assertion/runtime errors, it's the full stack as plaintext `at function file:line:column` lines. For timeouts, it's `${test.id}_${message}` to ensure consistent deduplication. Vitest's JSON reporter serializes this into `failureMessages[]`.

### Error Types

| Error Name | Source | Meaning |
|------------|--------|---------|
| `AssertionError` | `__assertion_fail` callback | Failed `expect()` assertion |
| `WASMRuntimeError` | `abort()` import (runtime) | Null deref, out-of-bounds, unreachable, etc. |
| `WASMExecutionAbortError` | Pool internal | Control flow — signals that abort handler threw to halt WASM |
| `WASMExecutionHarnessError` | Pool internal | Unexpected executor error (missing exports, instantiation failure) |
| `PoolSyntaxError` | Pool internal | Function signature mismatch during discovery (user code issue) |

**Key source files:**
- [`src/wasm-executor/wasm-errors.ts`](../src/wasm-executor/wasm-errors.ts) — `enhanceTestError()`, `processWASMErrorStack()`
- [`src/util/test-error-formatting.ts`](../src/util/test-error-formatting.ts) — `toVitestLikeStackFrameString()`, `getSourceCodeFrameString()`
- [`src/wasm-executor/wasm-imports.ts`](../src/wasm-executor/wasm-imports.ts) — abort handlers for discovery and execution contexts
- [`src/wasm-executor/source-maps.ts`](../src/wasm-executor/source-maps.ts) — source map parsing, V8 call stack extraction

---

## Timeout Architecture

Test timeouts are enforced from the PoolWorker main thread, not from within the worker thread. This is necessary because a long-running or infinite-loop WASM execution blocks the worker thread's event loop, making in-thread timers impossible.

```
test-worker-thread                  PoolWorker (main thread)
       │                                       │
       ├─ postMessage(execution-start) ──────> │
       │   { test, executionStart }            │  Start timeout timer
       │                                       │  (adjusted for msg transit time)
       │   ... test executing ...              │
       │                                       │
  ┌────┤  (A) Test completes normally          │
  │    ├─ postMessage(execution-end) ─────────>│  Clear timeout timer
  │    │                                       │
  │    │  OR                                   │
  │    │                                       │
  │    │  (B) Timer fires (timeout!)           │
  │    │                                       ├─ failTestWithTimeoutError()
  │    │                                       ├─ flagTestTerminated()
  │    │                                       ├─ threadAbortController.abort()
  │    │<──────────── thread aborted ──────────┤
  │    │                                       │
  │    │                                       ├─ Re-dispatch orchestrateFileRuns
  │    │                                       │   with timedOutTest parameter
  │    │                                       │
       │  New worker thread picks up           │
       │  runSuite() with timedOutTest:        │
       │   • Skip completed tests              │
       │   • Retry or finalize timed-out test  │
       │   • Continue remaining tests          │
       │                                       │
```

### Task Object Mutation & Hierarchy Preservation

Following vitest's own data flow patterns, the runner modifies the representative `File`, `Suite`, and `Test` task objects directly as it runs. The task hierarchy is preserved via self-referencing links (`test.suite` → parent suite, `suite.tasks` → children) which persist correctly across serialization between threads.

When a test starts, the `execution-start` message sends the current `Test` object to the PoolWorker. Because this object contains references to the full hierarchy (parent suite, sibling tests, file), the PoolWorker has access to the complete state of the test run at the moment of timeout. This enables clean resume: after aborting the thread, `orchestrateFileRuns(timedOutTest)` is called, and `runSuite()` uses the hierarchy to:

- Skip tests marked with `flagTestFinalized` (completed before timeout)
- Retry or finalize the timed-out test based on its `retry` configuration
- Continue executing remaining tests that haven't run yet
- Re-aggregate coverage data from completed children (see below)

**Coverage on resume:** Each suite initializes fresh empty coverage data on entry — there is no explicit "restore" of accumulated parent coverage. Coverage from completed tests is not lost because each completed test's individual `meta.coverageData` is preserved in the task hierarchy across the thread boundary. As `runSuite()` walks through tasks on resume, it skips completed tests' execution but still merges their preserved coverage data into the parent suite — the same merge step that happens during normal execution. Coverage is reconstructed naturally from children rather than explicitly restored. See [Coverage Architecture](coverage-architecture.md) for additional details on coverage collection.

**`flagTestFinalized`** marks a test as completed — prevents it from being re-run on resume. Set after each test finishes (pass or fail, all retries exhausted).

**`flagTestTerminated`** records the termination timestamp — used only for measuring resume latency in debug logging. Does not prevent re-running.

**Key source:**
- [`src/pool/pool-worker.ts`](../src/pool/pool-worker.ts) — `handleTestExecutionStart()`, `handleTestExecutionEnd()`, `handleTimeout()`
- [`src/pool-thread/runner/test-runner.ts`](../src/pool-thread/runner/test-runner.ts) — `runSuite()` resume logic

---

## RPC Communication

Workers communicate with vitest core via RPC (birpc over MessageChannel) to report test progress and results. This enables vitest's UI, reporters, and watch mode to display real-time updates.

### RPC Event Flow

```
Worker Thread                           Vitest Core
    │                                        │
    ├─ onQueued(file) ──────────────────────>│  File queued
    │                                        │
    ├─ onCollected(file) ──────────────────> │  Tests discovered, task tree built
    │                                        │
    ├─ onTaskUpdate(suite) ────────────────> │  Suite starting
    │    state: 'run', event: suite-prepare  │
    │                                        │
    ├─ onTaskUpdate(test) ─────────────────> │  Test starting
    │    state: 'run', event: test-prepare   │
    │                                        │
    ├─ onTaskUpdate(test) ─────────────────> │  Test finished
    │    state: 'pass'|'fail'                │
    │    event: test-finished                │
    │                                        │
    ├─  ... more tests ...                   │
    │                                        │
    ├─ onTaskUpdate(suite) ────────────────> │  Suite finished
    │    state: 'pass'|'fail'                │
    │    event: suite-finished               │
    │    + onAfterSuiteRun(coverageData)     │  Coverage data (if enabled)
    │                                        │
    └─ flush: onTaskUpdate([], []) ────────> │  Final flush
```

### RPC Methods

| Method | When | Purpose |
|--------|------|---------|
| `onQueued(file)` | File processing starts | Notify vitest that file is being processed |
| `onCollected(files)` | Discovery complete | Send complete task tree with timing metadata |
| `onTaskUpdate(packs, events)` | During execution | Stream test/suite results progressively |
| `onAfterSuiteRun(meta)` | File tests complete | Send coverage data to coverage provider |
| `getCountOfFailedTests()` | After test failure | Query failure count for bail logic |
| `onCancel(reason)` | Bail threshold hit | Request vitest cancel remaining tests |

### Responsibility Boundaries

Workers own both **reporting** and **test runner logic**. The runner ([`test-runner.ts`](../src/pool-thread/runner/test-runner.ts)) manages the full test execution lifecycle: running suites recursively, handling retries within a file, processing `fails` modifiers, checking bail thresholds, and aggregating coverage up the suite tree.

The PoolWorker manages **per-file orchestration and timeout enforcement**. It dispatches files to thread pools, monitors for timeouts via message passing, and handles abort + resume when a test exceeds its timeout. The PoolWorker never calls RPC methods directly — it operates at the file dispatch level while workers handle all vitest communication.

This evolved from the v3 architecture where the pool (main thread) owned more of the orchestration logic.

### Throttling Decision

We do not throttle RPC messages, and this is intentional. Vitest's internal pools throttle `onTaskUpdate` at 100ms intervals to prevent reporter flooding — this was introduced to fix a scenario where 44,000 fast JS tests completing in 3 seconds caused the reporter to show "0/1000 passed" while all tests had finished.

This scenario doesn't apply to our pool for several reasons:
- AS tests involve WASM instantiation overhead (~0.43ms each) and are inherently slower than pure JS tests
- Our per-file architecture bounds RPC messages to `(tests_in_file * 2) + suites + lifecycle` per worker
- We `await` each RPC call, creating natural backpressure (unlike vitest's fire-and-forget approach)

If profiling at scale reveals a bottleneck, throttling would be contained to [`src/pool-thread/rpc-reporter.ts`](../src/pool-thread/rpc-reporter.ts).

**Key source files:**
- [`src/pool/worker-rpc-channel.ts`](../src/pool/worker-rpc-channel.ts) — MessageChannel + birpc setup
- [`src/pool-thread/rpc-reporter.ts`](../src/pool-thread/rpc-reporter.ts) — all RPC reporting functions

---

## Coverage Architecture Summary

Coverage collection is implemented via native (C++) WASM instrumentation, which does make the pool platform-specific (as the next section on the [native build & distribution](#native-build--distribution) goes into detail about).

We supply a hybrid coverage provider that can be used for both AssemblyScript test coverage and JS test coverage (via a delegated internal v8 coverage module). Coverage data is gathered and reported to our hybrid coverage provider via `onAfterSuiteRun` in a pool-specific format, and then the provider processes the coverage, converts it to Istanbul format, and merges it with the Istanbul-formatted coverage report from the delegated v8 coverage provider. This generates unified coverage reports that include both AssemblyScript and JavaScript coverage.

See [Coverage Architecture](coverage-architecture.md) for detailed coverage internals.

### Instrumentation

The native C++ addon ([`src/instrumentation/native/addon.cpp`](../src/instrumentation/native/addon.cpp)) performs three operations on each compiled WASM binary:

1. **Debug extraction**: Walk the WASM binary with source map to extract function metadata (names, source positions, representative locations)
2. **Instrumentation**: Inject function-entry hit counter operations at each function entry point, writing to a dedicated coverage memory
3. **Source map regeneration**: Rebuild the source map with correct offsets after instrumentation (byte offsets change when instructions are injected)

Coverage counters are stored in a separate `WebAssembly.Memory` instance (`__coverage_memory` import), isolating them from user test memory. Counters are incremented via native WASM `i32.load/store` operations — no JS boundary crossing during test execution.

### Data Flow

```
┌─ Compile Thread ──────────────────────────────────────────────────┐
│  Compile AS → WASM + source map                                   │
│  Native addon: extract debug info, instrument, regen source map   │
│  → WASMCompilation (binary, sourceMap, debugInfo)                 │
└──────────────────────────────────┬────────────────────────────────┘
                                   ↓
┌─ Test Thread ─────────────────────────────────────────────────────┐
│  Execute each test in fresh WASM instance                         │
│  Read hit counters from coverage memory per test                  │
│  Merge coverage data up suite tree → onAfterSuiteRun              │
└──────────────────────────────────┬────────────────────────────────┘
                                   ↓
┌─ Coverage Provider (once per run) ────────────────────────────────┐
│  onAfterSuiteRun: accumulate hit counts across all test files     │
│  generateCoverage: parse source (AST), containment match,         │
│    → Istanbul CoverageMap, merge with JS/TS v8 → unified reports  │
└───────────────────────────────────────────────────────────────────┘
```

### Containment Matching

Binary debug info provides **points** (a representative source location for each function). Source AST parsing provides **ranges** (start/end line/column for each function definition). The coverage provider's containment matcher bridges these: for each binary hit position, find the source function whose range contains that position, using "tightest fit" for nested functions (innermost wins).

This approach was chosen because simpler strategies failed:
- Name matching breaks for anonymous/nested functions (`~anonymous|N` names can't be reliably recreated from source)
- Direct position matching is fragile because the AS compiler generates inconsistent source map positions by statement type

### Hybrid Provider

`HybridCoverageProvider` ([`src/coverage-provider/hybrid-coverage-provider.ts`](../src/coverage-provider/hybrid-coverage-provider.ts)) serves as the coverage provider for mixed JS+AS projects:

- Accumulates AS coverage data from `onAfterSuiteRun()` calls (identified by `__format: 'assemblyscript'` marker)
- Delegates JS/TS coverage to vitest's built-in V8 coverage provider
- In `generateCoverage()`: converts accumulated AS data to Istanbul format, merges with V8 coverage into a unified `CoverageMap`
- Delegates report generation (HTML, LCOV, JSON, text) to the V8 provider's reporters

### Coverage Configuration

The hybrid coverage provider adds custom configuration options (like `assemblyScriptInclude` and `assemblyScriptExclude`) to vitest's coverage config. These are made available to users' `vitest.config.ts` via **TypeScript module augmentation**: [`src/config/custom-provider-options.ts`](../src/config/custom-provider-options.ts) extends vitest's `CustomProviderOptions` interface with our `HybridProviderOptions` fields.

The augmentation is loaded automatically as a side-effect import when users import from the `./config` or `./v3/config` entry points (e.g. `import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config'`). This gives users full type-checking and IDE autocomplete for AS-specific coverage options alongside standard vitest coverage options, without requiring any additional configuration.

---

## Native Build & Distribution

Coverage instrumentation requires a native C++ addon that links against the Binaryen library. The build and distribution system is designed to be error-tolerant — if the native build fails, the package still installs successfully and tests run without coverage.

### Install Flow

```
npm install vitest-pool-assemblyscript
  └─> "install" hook: scripts/install-native-addon.js
      │
      ├─ Step 1: Try loading existing prebuild/build via node-gyp-build
      │   └─ Found? → cleanUnusedPrebuilds() → clearNativeBuildError() → exit 0
      │
      ├─ Step 2: Download Binaryen dependency (scripts/setup-binaryen.js)
      │   ├─ Linux/Windows: download prebuilt static lib + source headers
      │   ├─ macOS: cmake build from source (needs static .a, official only ships .dylib)
      │   └─ Failed? → write .native-build-error marker → exit 0
      │
      └─ Step 3: Compile addon (npx node-gyp rebuild)
          └─ Failed? → write .native-build-error marker → exit 0

Always exits 0 — installation never fails due to native build issues.
```

### Prebuilt Binaries

The npm package ships prebuilt native addons for 7 platforms via prebuildify:

| Platform | Architecture | Notes |
|----------|-------------|-------|
| Linux (glibc) | x64, arm64 | |
| Linux (musl/Alpine) | x64 | |
| macOS | x64, arm64 | |
| Windows | x64, arm64 | |

On install, `node-gyp-build` checks the `prebuilds/` directory for a matching binary. If found, `cleanUnusedPrebuilds()` removes non-matching platform prebuilds (~21MB each), significantly reducing installed package size.

### Binaryen Dependency

The native addon links against Binaryen's C++ API (static library). The download strategy differs by platform:

- **Linux/Windows**: Download official prebuilt release (static library) + source tarball (C++ headers needed for compilation). Extract and combine into `third_party/binaryen/`.
- **macOS**: Official macOS releases only ship `libbinaryen.dylib` (shared library), but we need `libbinaryen.a` (static) for linking into the `.node` addon. So macOS downloads the source and builds from scratch using cmake with `-DBUILD_STATIC_LIB=ON`.

Binaryen version is pinned via the `BINARYEN_VERSION` file at the project root.

### Platform Compiler Flags

The addon requires C++17 with exceptions enabled ([`binding.gyp`](../binding.gyp)):

| Platform | Key Flags | Notes |
|----------|-----------|-------|
| Linux | `-std=c++17 -fexceptions -O3`, `-lpthread` | Explicitly removes node-gyp's default `-fno-exceptions` |
| macOS | `-std=c++17 -fexceptions -O3`, `MACOSX_DEPLOYMENT_TARGET: 10.15` | Minimum for C++17 std library support |
| Windows | `/std:c++17 /permissive /EHsc` | `/permissive` (lenient, NO dash) needed for Binaryen C++17 patterns |

### Runtime Error Handling

If the native build failed during install, the `.native-build-error` marker file records the failure stage (`binaryen-download` or `native-compile`) and a truncated error message. At runtime:

1. [`feature-check.ts`](../src/util/feature-check.ts) checks for the marker file and the addon's loadability
2. If the marker exists but the addon loads (stale marker after manual rebuild), the marker is cleared
3. If the addon genuinely can't load, a detailed warning is displayed with platform info, error preview, and resolution instructions
4. The pool runs without coverage — test execution is unaffected

### Node Version Support

- **Node 22+**: Full support (test execution + coverage)
- **Node 20**: Test execution works, but coverage requires WASM multi-memory (V8 12.0+, shipped in Node 22). A warning is displayed via `warnIfASCoverageNotSupportedByNode()` when coverage is enabled on Node < 22. Note that this is no longer actively tested, as Node 20 reached EOL on April 30, 2026.

**Key source files:**
- [`scripts/install-native-addon.js`](../scripts/install-native-addon.js) — install hook
- [`scripts/setup-binaryen.js`](../scripts/setup-binaryen.js) — Binaryen download/build
- [`binding.gyp`](../binding.gyp) — native addon build configuration
- [`src/util/feature-check.ts`](../src/util/feature-check.ts) — runtime checks and warnings

---

## CI/CD Pipeline

The release workflow ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) runs in four stages:

### 1. Build
TypeScript compilation on Ubuntu. Produces `dist/` artifacts. Native build is skipped (`VITEST_POOL_AS_SKIP_NATIVE_BUILD=1`).

### 2. Prebuild
7-platform matrix builds native addon prebuilds via prebuildify. Each platform:
- Downloads Binaryen dependencies
- Runs `prebuildify --napi --strip --tag-libc`
- Uploads prebuild artifact

Prebuilds are cached keyed on a hash of source files (`src/instrumentation/native/**`, `binding.gyp`, `BINARYEN_VERSION`, `setup-binaryen.js`, `package-lock.json`).

### 3. Test
Matrix of platforms and Node versions runs external tests against the `npm pack`-ed package:
- Platforms: Linux (x64, arm64, musl), macOS (Intel, ARM), Windows (x64, arm64)
- Node versions: 22, 24 (and 20 for Linux x64 no-coverage validation)
- Prebuilds are downloaded and verified BEFORE `npm ci` — this ensures `node-gyp-build` finds them during install
- Prebuild verification ([`scripts/verify-prebuild.js`](../scripts/verify-prebuild.js)) works around `actions/download-artifact@v4` issue #454, which can silently exit 0 with incomplete or empty downloads

### 4. Release
Downloads all prebuilds, runs semantic-release for versioning and changelog, publishes to npm with provenance.

For test organization, configurations, commands, and development workflow, see the [Developer Guide — Testing](developer-guide.md#testing).

---

## Vitest 3 Compatibility

Vitest 3 uses the `ProcessPool` API with `collectTests()` and `runTests()` methods, while vitest 5 and 4 use the message-based `PoolWorker` interface. All versions share the same underlying runners and execution engine.

### Architecture Differences

| Aspect | Vitest 5 and 4 (PoolWorker) | Vitest 3 (ProcessPool) |
|--------|----------------------|----------------------|
| API interface | `PoolWorker` (start/stop/send/on/off) | `ProcessPool` (collectTests/runTests) |
| Thread pools | 2 global Tinypools (compile + run) | 1 Tinypool (combined) |
| Worker entry | [`compile-worker-thread.ts`](../src/pool-thread/compile-worker-thread.ts) + [`test-worker-thread.ts`](../src/pool-thread/test-worker-thread.ts) | [`v3-tinypool-thread.ts`](../src/pool-thread/v3-tinypool-thread.ts) |
| Worker function | `runCompileAndDiscoverSpec` + `runFileSpec` | `runTestFile` (compile + discover + execute) |
| Dispatch model | Separate compile and test dispatches | Single dispatch does everything |

### Shared Components

Both versions use the same:
- **Runners**: [`compile-runner.ts`](../src/pool-thread/runner/compile-runner.ts) (`runCompileAndDiscover`), [`test-runner.ts`](../src/pool-thread/runner/test-runner.ts) (`runSuite`, `runTest`)
- **RPC reporter**: [`rpc-reporter.ts`](../src/pool-thread/rpc-reporter.ts) (all reporting functions)
- **WASM executor**: [`wasm-executor/`](../src/wasm-executor/) (discovery, test execution, error enhancement)
- **Coverage provider**: [`coverage-provider/`](../src/coverage-provider/) (hybrid provider, containment matcher, Istanbul converter)
- **Compiler**: [`compiler/`](../src/compiler/) (AssemblyScript compilation)
- **Native addon**: [`instrumentation/`](../src/instrumentation/) (debug extraction, instrumentation)

### Separate Entry Points

The package exports separate entry points for v3 and v4+:

| Export | Entry | Purpose |
|--------|-------|---------|
| `.` | [`src/index.ts`](../src/index.ts) | v4+ pool factory (`createAssemblyScriptPool`) |
| `./v3` | [`src/index-v3.ts`](../src/index-v3.ts) | v3 pool factory (default export) |
| `./config` | [`src/config/index.ts`](../src/config/index.ts) | v4+ config helpers |
| `./v3/config` | [`src/config/index-v3.ts`](../src/config/index-v3.ts) | v3 config helpers |
| `./coverage` | [`src/coverage-provider/index.ts`](../src/coverage-provider/index.ts) | Coverage provider (shared) |

Separate entry points were not the preferred approach — a single entry point would be simpler for users. However, v3 and v4+ have different vitest API dependencies and version-specific code. The v4+ entry imports `PoolWorker` and `PoolRunnerInitializer` types that don't exist in vitest 3, and the v3 entry imports `ProcessPool` and `Vitest` types with v3-specific signatures. Bundling them together would cause import failures when only one vitest version is installed. Separate entry points allow each to import only the APIs available in its target vitest version.

**Key source files:**
- [`src/pool/v3-process-pool.ts`](../src/pool/v3-process-pool.ts) — `createAssemblyScriptProcessPool()`
- [`src/pool-thread/v3-tinypool-thread.ts`](../src/pool-thread/v3-tinypool-thread.ts) — combined worker (`runTestFile`)
- [`src/config/config-helpers-v3.ts`](../src/config/config-helpers-v3.ts) — `defineAssemblyScriptConfig()`, `defineAssemblyScriptProject()`
