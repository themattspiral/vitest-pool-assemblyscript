## Architecture Overview

Built on the Vitest 3.x [`ProcessPool` API](https://v3.vitest.dev/advanced/pool.html) for alternative runtime execution (4.x support is comming very soon!)

#### High-Level Pool Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Vitest Core (Node.js)                    │
│         Test Discovery, Watch, UI, Reporters                │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│              vitest-pool-assemblyscript                     │
│                  (ProcessPool Interface)                    │
├─────────────────────────────────────────────────────────────┤
│  collectTests(specs):                                       │
│    • Compile AS → WASM (with instrumentation)               │
│    • Extract debug info (native addon)                      │
│    • Execute to query test registry                         │
│    • Cache binary for runTests (watch mode)                 │
│    • Report structure via onCollected RPC                   │
│                                                             │
│  runTests(specs):                                           │
│    • Reuse cached binary (watch mode) or Compile AS → WASM  │
│    • Execute each test in fresh WASM instance               │
│    • Collect results + coverage                             │
│    • Report via onTaskUpdate RPC                            │
└─────────────────────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│            Per-Test WASM Execution (Isolation)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Test 1       │  │ Test 2       │  │ Test 3       │       │
│  │ Fresh WASM   │  │ Fresh WASM   │  │ Fresh WASM   │       │
│  │ instance     │  │ instance     │  │ instance     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

#### Worker Orchestration & Parallel Pipeline

**Concurrent File Processing:**
```
  Pool (Main Thread)                      Workers (Tinypool)
┌──────────────────────────────┐
│  File Queue (from vitest):   │
│  • file1.as.ts [t1,t2,t3]    │
│  • file2.as.ts [t4,t5]       │
│  • file3.as.ts [t6,t7,t8]    │
│                              │
│  AS->WASM Compile in Pool:   │
│  • Warmup/caching advantage  │          ┌─────────────────────────────────────┐
│  • Queued to not block       |          |  Worker 1 (discoverTests, file1)    |
|    other files               │          │  • Instantiate WASM module          │
│                              │          |  • Execute _start()                 |
│  Pipeline Dispatches         │ dispatch |  • test() functions call imported   |
|    to Worker Thread Pool:    |─────────>|    callback to self-register        |
|  1. pool.run(file1, {        |  tests   │  • Report tests to vitest (RPC)     │
│       name: 'discoverTests'  |<─────────│  • Return tests to pool             |
|     })                       |          └─────────────────────────────────────┘
|                              |          ┌─────────────────────────────────────┐
│                              | dispatch |  Worker 2 (executeTest, t1)         |
|  2. pool.run(t1, {           |─────────>|  • Instantiate WASM module          |
|       name: 'executeTest'    |          |  • Execute t1 test function via     |
|     })                       |          |    WASM function table & index      |
|                              | coverage |  • Report result to vitest (RPC)    |
│                              |<─────────|  • Extract coverage, return to pool |
|  3. pool.run(t2, {           |          └─────────────────────────────────────┘
|       name: 'executeTest'    | dispatch ┌─────────────────────────────────────┐
|     })                       |─────────>|  Worker 3 (executeTest, t2)         │
│  Per-file Coverage is        | coverage |  • Same process, for t2             |    ┌─────────────────────────────┐
|    aggregated as they finish |<─────────|    as worker 2 does for t1          |    |  Worker 4 (executeTest, t3) |
|                |             |          └─────────────────────────────────────┘    └─────────────────────────────┘
|  4. Dispatch all tests       |                                                     ┌─────────────────────────────┐
|      in all files!           | ─────────────────── dispatch ─────────────────────> |  Worker 5 (executeTest, t4) |
|                              | <────────────────── coverage ─────────────────────  └─────────────────────────────┘
|  When all tests executed     |                                                     ┌─────────────────────────────┐
|    for a given file/suite:   |          ┌─────────────────────────────────┐        |  Worker 6 (executeTest, t5) |
│  5. pool.run(file1, {        | dispatch |  Worker 7 (fileSummary, file1)  │        └─────────────────────────────┘
│       name: 'fileSummary'    |─────────>|  • Report overall suite results |          ... continues for all tests
│     })                       │          |    and aggregated coverage for  |
|                              |          |    the file to vitest (RPC)     |
└──────────────────────────────┘          └─────────────────────────────────┘
```

**Pipeline Parallelism:**
- Per-file parallelism achieved by non-blocking compilation queue
- Per-test parallelism achieved by separate worker task dispatches for individual tests
```
Time ────────────────────────────────────────────────────────────────────────────>

File 1:  [Compile] ──> [Discover] → [Test1] [Test2] [Test3] → [Finalize File1]
           (pool)        (worker)     (worker per test)         (worker)

File 2:     [Compile] ──> [Discover] → [Test4] [Test5] ───────> [Finalize File2]
              (pool)        (worker)   (worker per test)           (worker)

File 3:        [Compile] ──> [Discover] → [Test6] [Test7] [Test8] → [Finalize File3]
                 (pool)        (worker)     (worker per test)          (worker)

            └──────────────────────────────────────────────────────────────┘
                 All phases happening concurrently with maximum overlap
```

**Key Characteristics:**
- ✅ **AS Compilation Warmup**: AssemblyScript compilation happens in pool thread to benefit from warmup (~75% compilation time decrease)
- ✅ **Non-blocking**: Compilation queued and orchestrated to avoid blocking test execution for other files
- ✅ **Worker dispatch**: Pool dispatches tasks to worker functions via `pool.run(data, { name: 'functionName' })`
- ✅ **Compilation cache**: Compiled WASM binaries and source maps for each file are cached in the pool
- ✅ **Per-file discovery**: One worker performs discovery to gather all available tests
- ✅ **Per-test execution**: Individual workers execute *each test* reusing the cached binary for new instances
- ✅ **Maximum overlap**: Files and tests progress through pipeline phases independently
- ✅ **Result aggregation**: Pool collects and merges coverage results for each file as workers complete
- ✅ **Hybrid Coverage Provider**: Hybrid coverage provider coverts AS coverage to Istanbul format and hands off to vitest for report generation, also routes JS/TS coverage to a built-in V8/Istanbul provider, so that global coverage config works for multiple projects/pools
- ✅ **Vitest RPC Updates**: Test discovery, execution results, file final results, and coverage are reported to vitest via RPC calls to achieve progressive updates in the runner UI 
