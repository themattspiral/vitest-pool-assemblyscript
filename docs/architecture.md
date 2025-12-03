# Architecture Overview

Built on the Vitest 3.x [`ProcessPool` API](https://v3.vitest.dev/advanced/pool.html) for alternative runtime execution.

4.x support is comming very soon!

## High-Level Pool Architecture

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
│    • Compile AS -> WASM (with instrumentation)              │
│    • Extract debug info (native addon)                      │
│    • Execute to populate test registry                      │
│    • Cache binary for runTests (watch mode)                 │
│    • Report structure via onCollected RPC                   │
│                                                             │
│  runTests(specs):                                           │
│    • AS -> WASM or Reuse cached binary (watch mode)         |
│    • Execute each test in fresh WASM instance               │
│    • Collect test results + coverage data                   │
│    • Report via RPC (onTaskUpdate and onAfterSuiteRun)      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│          Per-Test WASM Execution (Isolation)                │
│     Per-Test Worker Thread Dispatch (Parallelization)       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Test 1       │  │ Test 2       │  │ Test 3       │       │
│  │ Fresh WASM   │  │ Fresh WASM   │  │ Fresh WASM   │       │
│  │ instance     │  │ instance     │  │ instance     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│            vitest-pool-assemblyscript/covarage              │
│            Custom "Hybrid" Coverage Provider                │
├─────────────────────────────────────────────────────────────┤
│    • Accumulate coverage for entire run                     │
│    • Process AS, Delegate JS to v8 provider                 │
│    • Merge AS and JS coverage                               │
│    • Generate unified coverage reports                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Worker Orchestration & Parallel Pipeline

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

File 1:  [Compile] ──> [Discover] ─> [Test1] [Test2] [Test3] ─> [Finalize File1]
           (pool)        (worker)     (worker per test)         (worker)

File 2:     [Compile] ──> [Discover] ─> [Test4] [Test5] ───────> [Finalize File2]
              (pool)        (worker)   (worker per test)           (worker)

File 3:        [Compile] ──> [Discover] ─> [Test6] [Test7] [Test8] ─> [Finalize File3]
                 (pool)        (worker)     (worker per test)          (worker)

         └────────────────────────────────────────────────────────────────────────┘
                  All phases happening concurrently with maximum overlap
```

**Key Characteristics:**
- **AS Compilation Warmup**: AssemblyScript compilation happens in pool thread to benefit from warmup (~75% compilation time decrease)
- **Non-blocking**: Compilation queued and orchestrated to avoid blocking test execution for other files
- **Worker dispatch**: Pool dispatches tasks to worker functions via `pool.run(data, { name: 'functionName' })`
- **Compilation cache**: Compiled WASM binaries and source maps for each file are cached in the pool
- **Per-file discovery**: One worker performs discovery to gather all available tests
- **Per-test execution**: Individual workers execute *each test* reusing the cached binary for new instances
- **Maximum overlap**: Files and tests progress through pipeline phases independently
- **Result aggregation**: Pool collects and merges coverage results for each file as workers complete
- **Hybrid Coverage Provider**: Hybrid coverage provider coverts AS coverage to Istanbul format and hands off to vitest for report generation, also routes JS/TS coverage to a built-in V8/Istanbul provider, so that global coverage config works for multiple projects/pools
- **Vitest RPC Updates**: Test discovery, execution results, file final results, and coverage are reported to vitest via RPC calls to achieve progressive updates in the runner UI

---

### Worker Functions (Tinypool-based Parallelism)

The pool implements worker functions for granular phase-specific execution, enabling true pipeline parallelism:

#### Test Discovery
- **`discoverTests(task)`**
  - Instantiates WASM binary and executes `_start` to register tests
  - Tests register themselves via `__register_test` import callbacks
  - Returns list of discovered tests with names and function table indices
  - Reports RPC events: `onQueued`, `onCollected`, `suite-prepare`

#### Test Execution
- **`executeTest(task)`**
  - Executes single test in fresh WASM instance without coverage collection
  - Used when coverage disabled or in failsafe mode re-runs
  - Reports lifecycle events: `test-prepare`, `test-finished`

- **`executeTestWithCoverage(task)`**
  - Executes single test with coverage collection on instrumented binary
  - Supports optional failure reporting suppression (failsafe mode first run)
  - Reports lifecycle events: `test-prepare`, `test-finished` (unless suppressed)

#### File Finalization
- **`reportFileSummary(task)`**
  - Reports suite-finished and final flush events to close out file execution
  - Sends aggregated coverage data via `onAfterSuiteRun` (if coverage enabled)
  - Called after all tests in a file complete

#### Future Hook Support (Placeholders)
- **`executeBeforeAllHooks(task)`** - Not yet implemented
- **`executeAfterAllHooks(task)`** - Not yet implemented

---

### Pool Functions (Main Thread Orchestration)

The pool provides compilation, caching, and pipeline orchestration functions in the main thread:

#### Compilation & Caching
- **`compileAssemblyScript(filename, options)`**
  - Compiles AssemblyScript source to WASM binary using `asc` compiler
  - Runs in pool thread (not worker) to benefit from V8 JIT warmup
  - Returns both clean and instrumented binaries (when coverage enabled)
  - Configured with `--exportTable`, `--importMemory`, `--sourceMap` flags

- **`queueCompilation(testFilePath, config, rpcCollect, generation)`**
  - Sequential compilation queue maintaining V8 warmup benefits
  - Non-blocking: Returns promise that resolves when compilation completes
  - Enables per-file pipeline parallelism without blocking other files
  - Validates cache generation to handle watch mode invalidations

#### Phase Execution Functions
- **`executePhase1Compilation(testFilePath, projectConfig, cache, rpcCollect)`**
  - Returns cached compilation or triggers new compilation if needed
  - Validates cache generation before use
  - Throws on compilation failure or cache invalidation

- **`executePhase2Discovery(testFilePath, cached, spec, pool, rpcCollect)`**
  - Dispatches discovery to worker using clean binary
  - Populates `cached.discoveredTests` array
  - Worker reports RPC events during discovery

- **`executePhase3Tests(testFilePath, cached, testTasks, project, pool, isFailsafeMode)`**
  - Dispatches all tests to workers for parallel execution
  - Uses instrumented binary (coverage enabled) or clean binary (coverage disabled)
  - Workers report test results via RPC
  - Returns test results for coverage accumulation

- **`executePhase4FailsafeRerun(testFilePath, cached, testResults, testTasks, project, pool)`**
  - Re-runs failed tests on clean binary for accurate error messages
  - Only executes when failsafe mode enabled and failures detected
  - Warns if tests pass on clean after failing on instrumented
  - Returns updated results with clean binary results for failures

- **`executePhase5FinalizeFileResults(testFilePath, fileTask, testResults, project, pool)`**
  - Updates file task state based on actual test results
  - Dispatches `reportFileSummary` to worker for final RPC events
  - Called after test execution and optional failsafe reruns

#### Top-Level Orchestrators
- **`collectTests(specs, config, cache, pool)`**
  - Entry point for `vitest list` command and watch mode collection
  - Pipeline per file: Compile -> Discover
  - All file pipelines run concurrently
  - No test execution, only discovery

- **`runTests(specs, config, cache, pool, invalidates)`**
  - Entry point for full test execution
  - Pipeline per file: Compile -> Discover -> Execute -> (Failsafe Rerun) -> Finalize
  - All file pipelines run concurrently with maximum overlap
  - Handles cache invalidation in watch mode
  - Accumulates coverage from all files for unified reporting

---

### WASM ↔ Node.js Communication Architecture

**Strategy**: Import-based registration during `_start` + Table-based execution via `--exportTable`

#### Test Discovery Flow

**How tests register themselves:**

1. User writes: `test("test name", () => { /* test body */ })`
2. AS compiler compiles test file with `--exportTable` flag
3. Pool instantiates WASM with import callbacks provided via import object
4. WASM `_start` function executes automatically, running all top-level code
5. Each `test()` call invokes `__register_test(namePtr, nameLen, fnIndex)` import callback
   - `namePtr`/`nameLen`: String pointer/length for test name in WASM memory
   - `fnIndex`: WASM function table index for the test body function
6. Pool builds in-memory registry: `Array<{ name: string, fnIndex: number }>`

**No query functions needed** - Registry populated automatically via import callbacks during instantiation

#### Test Execution Flow

**Per-test isolation with table-based execution:**

1. For each test, create fresh `WebAssembly.Instance` from compiled module
2. Instantiate with import object containing:
   - Memory import (`env.memory`) - Created in Node.js and passed to WASM
   - Test registration callback (`env.__register_test`) - Stub during execution (tests already known)
   - Assertion callbacks (`env.__assertion_pass`, `env.__assertion_fail`)
   - Runtime callback (`env.abort`) - AS runtime abort handler
   - Coverage memory import (`env.__coverage_memory`) - Separate memory for coverage counters (when coverage enabled)
3. WASM `_start` called explicitly -> **initializes module globals**
   - Top-level code executes (global variables, constants, static initialization)
   - Test registration callbacks are stubs (tests already discovered, no-op)
   - Purpose: Initialize module state for test execution, not test discovery
4. Execute specific test: `instance.exports.table.get(test.fnIndex)()`
   - Direct function invocation via exported function table
   - No indirection, no WASM wrapper functions needed
5. Test reports results via import callbacks during execution
6. Instance discarded -> crash isolation (failures can't affect subsequent tests)

#### Import Callbacks (WASM -> Node.js)

All callbacks registered in WASM via `@external("env", "callbackName")` declarations:

**Test Lifecycle:**
- `__register_test(namePtr, nameLen, fnIndex)` - Register test during `_start` execution
  - Called once per test during top-level code execution
  - Adds test to in-memory registry with name and function table index

**Assertions:**
- `__assertion_pass()` - Track passed assertions (separate count from tests)
  - Increments assertion counter in test result
- `__assertion_fail(msgPtr, msgLen)` - Track failed assertions with error message
  - Marks test as failed and captures error message from WASM memory

**Runtime:**
- `abort(msgPtr, filePtr, line, column)` - AS runtime abort handler
  - Called on runtime errors (null reference, out of bounds, etc.)
  - Captures V8 call stack for source-mapped error reporting
  - Throws JavaScript error to halt execution and prevent subsequent callbacks

**Coverage:**
- `__coverage_memory` - Separate WebAssembly.Memory for coverage counters
  - Multi-memory approach (Node 20+) isolates coverage from test memory
  - WASM increments counters via native `i32.load/store` operations
  - Node.js reads counters after test execution via `Uint32Array` view

#### Why This Architecture?

- **No query overhead** - Registry built automatically during instantiation
- **Supports dynamic tests** - Conditional registration works naturally (tests registered when code executes)
- **Per-test crash isolation** - Fresh instance per test prevents cascading failures
- **Direct function execution** - `--exportTable` enables fast invocation without wrappers
- **Real-time assertion tracking** - Callbacks report results during test execution
- **No tree-shaking issues** - Import callbacks cannot be tree-shaken (external dependencies)
- **Fast coverage collection** - Native WASM memory operations avoid JS boundary crossing
- **Isolated coverage** - Separate coverage memory ensures no conflicts with user memory

---

### Coverage Architecture (v1 Current, v2 Planned)

**Overview**: Position-based matching connects binary execution to source coverage, supporting function-level (v1) and block-level (v2) granularity.

- **v1**: Direct position lookup - both binary and source sides key by first-expression position (`line:column`), enabling O(1) matching
- **v2**: May use containment matching where binary expression points map to source statement/branch ranges

**Implementation**: Binaryen.js post-processing instrumentation + native addon debug extraction
- Function-level coverage via native addon debug info and Binaryen post-processing
- ⚠️ **Failsafe mode required** - Post-processing breaks source maps, requiring two-pass execution

```
┌──────────────────────────────────────────────────────────────┐
│                    BINARY PREPARATION                        │
│    (Pool Main Thread, Per Test File, async promise queue)    │
├──────────────────────────────────────────────────────────────┤
│  Compilation (AssemblyScript Compiler)                       |
│                                                              │
│  • Input: 1 test file                                        │
│  • Transforms:                                               │
│    └─> Strip @inline decorators (afterParse)                 │
│  • Output:                                                   │
│    ├─> Clean WASM binary                                     │
│    └─> Source map                                            │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                            ↓                                 │
│  Instrumentation & Binary Debug Info Extraction              │
│                                                              │
│  v1: Native addon extraction + Binaryen.js instrumentation   │
│  • Native addon extracts debug info from WASM + source map   │
│  • Binaryen.js injects __coverage_trace() at func entries    │
│    • ⚠️ Breaks source map accuracy ⚠️                       │
│  • Add multi-memory for coverage counters                    │
│  • Returns:                                                  │
│    ├─> clean binary positions (debug info)                   │
│    └─> instrumented WASM binary                              │
│                                                              │
│  v2: Binaryen C++ native addon                               │
│  • instrumentForCoverage() single operation                  │
│  • Inject counters at basic block boundaries                 │
│  • Regenerate source map (maintains accuracy)                │
│  • Extract debug info: expression/block positions            │
│  • Returns:                                                  │
│    ├─> instrumentedWasm                                      │
│    ├─> sourceMap (regenerated)                               │
│    ├─> debugInfo                                             │
│    └─> memoryInfo                                            │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                            ↓                                 │
│  CachedCompilation stored in pool:                           |
|  • Reused between workers executing tests in same file       |
|  • Reused in watch mode between runs                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│     EXECUTION & COLLECTION (Workers + Pool Aggregation)      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 3: Test Execution (Worker Dispatch)                   │
│  For each test in test file:                                 │
│  • Dispatch to worker with instrumented binary               │
│  • Execute test in fresh WASM instance                       │
│  • Read hit counts from coverage memory                      │
│    (v1: per function, v2: per block)                         │
│  • Return coverage data to pool                              │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                            ↓                                 │
│  Pool Aggregation                                            │
│  Merge per-test coverage → per-test-file coverage            │
│  • Accumulate hit counts across source functions imported    |
     within a given test file (all individual test executions) |
│  • Store in pipelineCoverageByTestFile                       │
│  • Covers all functions/expressions across all               │
│    sources imported by this test file                        │
│  ──────────────────────────────────────────────────────────  │
│                            ↓                                 │
│  Phase 5: Report to Coverage Provider (Worker Dispatch)      │
│  onAfterSuiteRun(coverageData, debugInfo)                    │
│  • Send aggregated coverage for this test file               │
│  • Provider accumulates across all test files                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│   COVERAGE PROVIDER (Post-Pipeline, Global, Once Per Run)    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  onAfterSuiteRun() - Accumulation                            │
│  For each test file completion:                              │
│  ├─> AS: Merge coverage data by source position-based key,   │
│  │       **source position extracted from binary debugInfo** │
│  │        (DebugInfo's source filePath:line:column is stable |
|  |         between different test binary executions)         │
│  │       - Accumulate hit counts across all test files       │
│  └─> JS: Delegate to v8 provider                             │
│                                                              |
|  ──────────────────────────────────────────────────────────  │
│                            ↓                                 │
│                                                              │
│  generateCoverage() - Final Report Generation                │
│                                                              │
│  AST Parser                                                  |
|  ────────────────────                                        │
│  • Read all source files (coverage.assemblyScriptInclude)    │
│  • AS parser extracts source position info                   │
│  • Build sourceDebugInfo:                                    │
│    ├─> All functions/expressions with ranges                 │
│    │   (startLine, startColumn, endLine, endColumn)          │
│    └─> Defines source of truth: what SHOULD be covered       │
│                                                              │
│  v1: Functions only                                          │
│  v2: Functions + statements + branches                       │
│                                                              │
│                            ↓                                 │
│  Coverage Matcher                                            │
│  ────────────────────                                        │
│  v1: Direct Position Lookup                                  │
│  • Both binary (BinaryDebugInfo) and parsed source           |
│    (ParsedSourceInfo) identify functions by file, then a     |
│     representative first-expression position (line:column)   │
|  • BinaryDebugInfo drives instrumentation, so CoverageData   |
|    hit counts will be identified with the same positions     |
|  • Given a CoverageData hit at a specific source position... |
│  • O(1) lookup: position → func info (from ParsedSourceInfo) │
│  • O(1) lookup: position → hit count (from CoverageData)     │
│                                                              │
│  v2: Containment Matching (planned)                          │
│  • Both binary (BinaryDebugInfo) and parsed source           |
│    (ParsedSourceInfo) identify covered items first by file   |
|  • BinaryDebugInfo drives instrumentation, so CoverageData   |
|    hit counts will be identified with the same positions     |
│  • Then ParsedSourceInfo uses ranges (start/end)             |
|  • Given a CoverageData hit at a specific source position... |
│     • Find source item whose range contains this point       │
│       • Iterate parsed source items for file                 │
│       • Other potential optimizations possible               │
│     • Use tightest fit for nested items                      │
│                                                              │
│  Build merged coverage map:                                  │
│  ├─> All source items basis from ParsedSourceInfo, 0 hits    │
│  ├─> Map accumulated hit counts from position-based merged   │
│  │   CoverageData from onAfterSuiteRun() onto source items   │
│  │   using v1 (position lookup) or v2 (containment match)    │
│  └─> Generate Complete Coverage Map: covered + uncovered     │
│                                                              │
│  Strategy Evolution:                                         │
│  • pre-v1: Name matching (transform metadata)                │
│  • v1: Direct position lookup (functions only)               │
│  • v2: Containment matching (statements/branches)            │
│                                                              │
│                            ↓                                 │
│                                                              │
│  Istanbul Converter                                          │
│  ────────────────────                                        │
│  • Convert internal CoverageData → Istanbul CoverageMap      │
│  • Per file:                                                 │
│    ├─> Build fnMap, statementMap, branchMap                  │
│    └─> Apply hit counts to generate f, s, b arrays           │
│    └─> Add file map to overall CoverageMap                   │
│                                                              │
│  v1: Function coverage (function → statement map)            │
│  v2: All 4 types (function, statement, branch, line)         │
│                                                              │
│                            ↓                                 │
│                                                              │
│  Unified Coverage Merge                                      │
│  ────────────────────                                        │
│  ├─> Get JS/TS coverage from v8 provider                     │
│  ├─> Merge AS Istanbul CoverageMap into JS CoverageMap       │
│  └─> Return unified CoverageMap                              │
│                                                              │
│                            ↓                                 │
│                                                              │
│  reportCoverage() - Delegate to v8 provider's reporters:     │
│  └─> LCOV, HTML, JSON, text formats                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Architectural Decisions:**

1. **Position-based Matching** (not name-based)
   - Handles anonymous functions, nested functions, naming convention changes
   - v1: Direct position lookup (both sides key by first-expression position)
   - v2: Containment matching (binary points → source ranges)
   - Performance: v1 is O(1); v2 uses file grouping baseline with optimization strategies available

2. **Instrumentation Location** - Pool main thread (not separate worker dispatch)
   - Native addon C++ code is fast, small parallelization benefit vs overhead
   - Simplicity over premature optimization

3. **AST Parsing Location** - Coverage provider (not pipeline)
   - Provider owns assemblyScriptInclude glob configuration
   - Separation of concerns: pipeline collects raw data, provider interprets and reports in the context of what should be covered

4. **Data Flow** - Two-phase approach
   - Execution Pipeline: Binary execution → hit counts (what was executed)
   - Coverage Provider: Source parsing → coverage map (what should be covered)
     - Matcher combines both for complete picture

---

### Vitest RPC Communication

The pool communicates with Vitest core via RPC (Remote Procedure Call) to report test progress and results. This enables Vitest's UI, reporters, and watch mode to display real-time updates.

#### RPC Event Flow

**CollectTests Flow** (Discovery Only):
```
Pool/Worker                          Vitest Core
    │                                      │
    ├─ onQueued(file) ────────────────────>│  File queued for collection
    │                                      │
    ├─ onCollected(file) ─────────────────>│  Tests discovered, task tree built
    │                                      │
```

**RunTests Flow** (Discovery + Execution):
```
Pool/Worker                          Vitest Core
    │                                      │
    ├─ onQueued(file) ────────────────────>│  File queued for execution
    │                                      │
    ├─ onCollected(file) ─────────────────>│  Tests discovered, task tree built
    │                                      │
    ├─ onTaskUpdate(file) ────────────────>│  Suite (file) starting
    │    state: 'run'                      │
    │    event: 'suite-prepare'            │
    │                                      │
    ├─ onTaskUpdate(test) ────────────────>│  Test 1 starting
    │    state: 'run'                      │
    │    event: 'test-prepare'             │
    │                                      │
    ├─ onTaskUpdate(test) ────────────────>│  Test 1 finished
    │    state: 'pass' | 'fail'            │
    │    event: 'test-finished'            │
    │                                      │
    ├─  ... (test 2, test 3, etc.) ...  ──>│  Other tests execute, send similar events
    │                                      │
    ├─ onAfterSuiteRun(file) ─────────────>│  Coverage data (if enabled)
    │    coverage: {...}                   │
    │    testFiles: [...]                  │
    │                                      │
    ├─ onTaskUpdate(file) ───────────────> │  Suite (file) finished
    │    state: 'pass' | 'fail'            │
    │    event: 'suite-finished'           │
    │                                      │
    ├─ onTaskUpdate([], []) ──────────────>│  Final flush
    │                                      │
```

#### RPC Methods

**Core Methods (Required):**

1. **`onQueued(file)`**
   - **When**: File processing starts
   - **Purpose**: Notify UI that file is being processed
   - **Payload**: File task with basic metadata (filepath, projectName, pool)
   - **Called by**: Worker in `discoverTests`

2. **`onCollected(files)`**
   - **When**: Test discovery complete
   - **Purpose**: Send complete task tree with all tests
   - **Payload**: Array of File tasks with complete test hierarchy
   - **Timing metadata**: `prepareDuration`, `environmentLoad`, `setupDuration`, `collectDuration`
   - **Called by**: Worker in `discoverTests`

3. **`onTaskUpdate(taskPacks, eventPacks)`**
   - **When**: Progressive updates during test execution
   - **Purpose**: Stream test results in real-time
   - **Throttling**: Batched to ~100ms intervals to prevent RPC flooding
   - **Payload**:
     - `taskPacks`: `Array<[taskId, result, meta]>` - Task results
     - `eventPacks`: `Array<[taskId, event, data]>` - Lifecycle events
   - **Called by**: Worker in `executeTest`, `executeTestWithCoverage`, `reportFileSummary`

4. **`onAfterSuiteRun(meta)`**
   - **When**: After all tests in file complete (if coverage enabled)
   - **Purpose**: Send coverage data to Vitest coverage provider module (custom pool's hybrid provider)
   - **Payload**:
     ```typescript
     {
       coverage: CoverageData,           // AS coverage in custom format
       testFiles: string[],              // Sorted array of test file names
       transformMode: 'web' | 'ssr',     // Module transform mode
       projectName: string | undefined   // Project name
     }
     ```
   - **Called by**: Worker in `reportFileSummary`

#### Task Update Events

**Suite Events:**
- `suite-prepare` - Suite starting execution
- `suite-finished` - Suite completed (pass/fail state with duration)
- `suite-failed-early` - Suite failed during collection

**Test Events:**
- `test-prepare` - Test starting execution
- `test-finished` - Test completed (pass/fail state with duration)
- `test-retried` - Test failed and will retry
- `test-failed-early` - Test already failed before execution

**Hook Events** (not yet implemented):
- `before-hook-start` / `before-hook-end` - beforeAll/beforeEach hooks
- `after-hook-start` / `after-hook-end` - afterAll/afterEach hooks

#### Task Result Format

**TaskResultPack**: `[taskId, result, meta]`

```typescript
{
  state: 'run' | 'pass' | 'fail' | 'skip' | 'todo',
  errors?: ErrorWithDiff[],         // If test failed
  duration?: number,                // In milliseconds
  startTime?: number,               // Unix timestamp
  hooks?: {                         // Hook execution states (suites)
    beforeAll?: TaskState,
    afterAll?: TaskState,
    beforeEach?: TaskState,
    afterEach?: TaskState
  },
  retryCount?: number,              // Current retry attempt
  note?: string,                    // Skip reason
}
```

#### RPC Communication Patterns

**Batching & Throttling:**
- Task updates batched into arrays during execution
- Throttled to maximum 100ms intervals (prevents RPC flooding)
- Final flush ensures no updates lost: `onTaskUpdate([], [])`

**Worker-Pool Boundary:**
- Workers call RPC methods directly (via MessagePort)
- Pool NEVER calls RPC directly (orchestration only)
- Workers own the reporting responsibility

**Progressive Reporting:**
- Tests report as they complete (not batched by file)
- Enables real-time UI updates in Vitest
- File-level summary reported after all tests complete

---
