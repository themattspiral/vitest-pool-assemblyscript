# Coverage Architecture

Containment matching connects binary execution to source coverage, supporting function-level (v1) and block-level (v2) granularity.

---

#### Key Architectural Decisions

1. **Three-Phase Data Collection and Matching**
  - Execution pipeline collects raw hit counts (what was executed)
  - Coverage provider parses source files (what should be covered)
  - Matcher (within coverage provider) combines both for complete coverage picture

2. **Instrumentation Granularity**
   - v1: Per-function entry counters via native addon (with source map regeneration)
   - v2 (planned): Per-basic-block counters via native addon for statement/branch coverage

3. **Function Binary Position Selection** - When identifying a function's representative position from binary debug info, prefer Return expressions (structural to the function, never inlined from elsewhere), falling back to first non-Const expression (avoids inlined default parameter values).

4. **Containment-Based Matching** - Match binary execution positions to source code by checking if a position falls within a source range.
   - **Function Matching** - simpler approaches failed:
     - *Name matching*: Anonymous/nested functions have generated names (`~anonymous|N`); compiler naming conventions using `N` can't be reliably recreated purely using source
     - *Direct position matching*: AS compiler generates inconsistent source map positions by statement type (variable declarations point to keyword, control flow points to condition expression, inlined default parameters map back to original definition)
   - **Statement & Branch matching** - containment is fundamentally required: binary expression points must map to source statement/branch ranges

5. **Statement Matching Query Direction** - Iterate source statements checking for contained hit positions (interval → points) rather than iterating hits to find containing statements (point → interval). Line-indexed hit positions enable efficient O(1) line lookups.

6. **Source Parsing in Coverage Provider** - AST parsing happens in the coverage provider (not execution pipeline), which owns the `assemblyScriptInclude` configuration. Separates raw data collection from interpretation against source of truth.

#### Implementation

**v1:** Native addon handles debug extraction + function-level instrumentation + source map regeneration
- Native addon extracts function debug info from WASM binary + source map
- Native addon injects `__coverage_trace()` calls at function entry points
- Source map regeneration maintains accuracy (no failsafe re-runs needed)
- Multi-memory for isolated coverage counters

**v2 (Planned):** Native addon upgrades to block-level instrumentation
- Block-level instrumentation at basic block boundaries (upgrade from function-level)
- All four coverage types: function, statement, branch, line

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
│  v1: Native addon (extraction + instrumentation + sourcemap) │
│  • Extract debug info from WASM + source map                 │
│  • Inject __coverage_trace() at function entry points        │
│  • Regenerate source map (maintains accuracy)                │
│  • Add multi-memory for coverage counters                    │
│  • Returns:                                                  │
│    ├─> instrumentedWasm                                      │
│    ├─> sourceMap (regenerated)                               │
│    └─> debugInfo                                             │
│                                                              │
│  v2: Native addon (upgrade to block-level)                   │
│  • Inject counters at basic block boundaries                 │
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
│  v1: Containment Matching (functions)                        │
│  • Binary (BinaryDebugInfo) provides representativeLocation  │
│  • Source (ParsedSourceInfo) provides function ranges        │
│  • Find source function whose range contains binary point    │
│  • "Tightest fit" for nested functions (innermost wins)      │
│  • CoverageData: position-based (hitCountsByFileAndPosition) │
│                                                              │
│  v2: Containment Matching (functions + statements + branches)│
│  • RawBlockCoverage: coverageIndex-based blockHitCounts array│
│  • Pool accumulates via element-wise array addition          │
│    (coverageIndex stable within same binary)                 │
│  • Stage 5 converts once per test file to position-based:    │
│    - Propagate block hits → expression positions by line     │
│    - Build branch path hits from target block counters       │
│  • Then containment matching as above, plus:                 │
│    - Statement: expression hits within statement range       │
│    - Branch: target location within path range               │
│                                                              │
│  Build merged coverage map:                                  │
│  ├─> All source items from ParsedSourceInfo, 0 hits          │
│  ├─> For each hit position in CoverageData:                  │
│  │   └─> Find containing source item via containment match   │
│  └─> Generate Complete Coverage Map: covered + uncovered     │
│                                                              │
│  Strategy Evolution:                                         │
│  • pre-v1: Name matching (transform metadata)                │
│  • v1: Containment matching (functions only)                 │
│  • v2: Containment matching (functions + statements/branches)│
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

#### Coverage Types by Version

| Version | Type | Data Source | Matching Strategy | Complexity |
|---------|------|-------------|-------------------|------------|
| v1 | Function | Per-function counters | point → interval (containment) | O(H × L) |
| v1 | Statement | — | — | Derived from functions |
| v1 | Branch | — | — | Not implemented |
| v1 | Line | — | — | Derived from functions |
| v2 | Function | Block counters → expression positions | point → interval (containment) | O(H × L) |
| v2 | Statement | Block counters → expression positions | interval → points (line-indexed) | O(S × line_span × positions_per_line) |
| v2 | Branch | Block counters for target blocks | position + path containment | O(B × p²) |
| v2 | Line | — | — | Derived from statements |

Where: H=unique hit positions, L=start lines ≤ target, S=statements, B=branches, p=paths per branch (~2-4)

#### Matching Strategies

**v1/v2 Function Matching (point → interval):**
- For each unique hit position, find which source function range contains it
- Functions indexed by start line; iterate start lines ≤ target line, check ranges
- "Tightest fit" for nested functions (innermost function wins)

**v2 Statement Matching (interval → points):**
- For each source statement, check if any hit position falls within its range
- Hit positions line-indexed; O(1) lookup per line in statement's range
- First hit found within range determines statement's hit count

**v2 Branch Matching (position + path containment):**
- O(1) position lookup by branch condition location
- For each binary path, find which source path range contains its representative location

#### Matching Performance Analysis

**v1/v2 Function Matching (point → interval)**

For each unique hit position, find which source function contains it.

Current approach: Functions indexed by start line, iterate all start lines ≤ target line, check ranges.

Why acceptable:
- Typical file: 10-50 functions, ~same number of unique start lines
- Linear scan of 50 items is microseconds
- Most functions have ~1 per start line, so range checks are minimal

Typical ops: H=50 unique positions × L=25 avg start lines = 1,250 ops per file

Optimizations available (diminishing returns for typical sizes):
- Binary search on sorted start lines: O(H × log F)
- Interval tree: O(H × (log F + k)) where k = nested depth

When to reconsider: Files with 200+ functions. Rare for AS projects.

**v2 Statement Matching: Why Iterate Statements, Not Hits?**

Two approaches produce the same result:
- **Approach A (point → interval):** Iterate unique hit positions, find containing statement (like function matching)
- **Approach B (interval → points):** Iterate statements, check for contained hit positions

Performance comparison (100% coverage / worst case for typical file):
- H=300 unique expression hit positions (≈1 per statement at full coverage)
- S=300 statements (medium-to-large file)
- line_span≈2 lines/statement (most statements are 1-3 lines)
- hit_positions_per_line≈3 (expressions cluster on lines with logic)

| Approach | Complexity | Typical Ops | Build Cost | Implementation |
|----------|------------|-------------|------------|----------------|
| A (start-line index) | O(H × S) | 90,000 | O(S) | Simple |
| A (interval tree) | O(H × log S) | 2,400 | O(S log S) | Complex |
| B (line-indexed) | O(S × line_span × hit_positions_per_line) | 1,800 | O(H) | Simple |

Why Approach B wins:
1. Near-optimal complexity without interval trees
2. Simpler implementation - just hash tables and array scans
3. Lower build cost - O(H) vs O(S log S)
4. Faster in practice - cache-friendly vs tree pointer chasing

The line-indexing turns O(H × S) into O(S × small_constant).

**v2 Branch Matching**

1. Position match: O(1) hash lookup by condition position to find binary branch
2. Path containment: For each binary path, find which source path contains its representative location

Complexity: O(B × p²) where B = branches, p = paths per branch.

Typical ops: B=50 branches × p²=9 (avg 3 paths) = 450 ops per file. Negligible.
