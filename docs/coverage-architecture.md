# Coverage Architecture

This document describes the coverage system of `vitest-pool-assemblyscript`: how WASM execution is instrumented, how hit data is collected and aggregated, how binary hit positions are matched to source code, and how the hybrid coverage provider produces unified reports. For overall pool architecture, see [Pool Architecture](pool-architecture.md).

---

**Table of Contents**
- [Overview](#overview)
- [Coverage Types](#coverage-types)
- [Instrumentation](#instrumentation)
- [Coverage Data Collection & Aggregation](#coverage-data-collection--aggregation)
- [Hybrid Coverage Provider](#hybrid-coverage-provider)
- [AST Source Parsing](#ast-source-parsing)
- [Containment Matching](#containment-matching)
- [Istanbul Conversion & Report Generation](#istanbul-conversion--report-generation)
- [Coverage Configuration](#coverage-configuration)
- [Key Architectural Decisions](#key-architectural-decisions)
- [Fidelity & Known Divergences](#fidelity--known-divergences)
- [Verification & Parity Oracle](#verification--parity-oracle)

---

## Overview

Coverage works by instrumenting compiled WASM binaries to count function and basic-block entries, then matching those binary hit positions back to source code. The system produces all four standard Istanbul coverage types — function, branch, statement, and line — which integrate with vitest's reporters.

```
    Compile Thread                Test Thread               Coverage Provider
    (per test file)        (per test file + resume)      (once per overall run)
┌─────────────────────┐     ┌────────────────────┐     ┌────────────────────────┐
│ AS → WASM           │     │ Per-test execution │     │ Parse AS source        │
│ Native addon:       │     │ in fresh instance  │     │   AST → fn/stmt/branch │
│  - extract          │ ──> │                    │ ──> │                        │
│  - instrument       │     │ Read hit counters  │     │ Match hit positions    │
│  - regen source map │     │ from coverage mem  │     │   to source ranges:    │
│                     │     │                    │     │   fn / stmt / branch   │
│ → WASMCompilation   │     │ Merge per-suite    │     │ → Istanbul format      │
│                     │     │ → onAfterSuiteRun  │     │ → Merge with v8 JS     │
└─────────────────────┘     └────────────────────┘     │ → Unified reports      │
                                                       └────────────────────────┘
```

The separation of concerns is intentional: the execution pipeline collects raw hit counts (what *was* executed), while the coverage provider parses source files (what *should* be covered) and combines both for a complete coverage picture.

**Key source files:**
- [`src/instrumentation/native/addon.cpp`](../src/instrumentation/native/addon.cpp) — C++ native addon (Binaryen)
- [`src/instrumentation/addon-interface.ts`](../src/instrumentation/addon-interface.ts) — TypeScript interface to native addon
- [`src/wasm-executor/index.ts`](../src/wasm-executor/index.ts) — WASM instantiation, coverage memory, hit count reading
- [`src/coverage-provider/hybrid-coverage-provider.ts`](../src/coverage-provider/hybrid-coverage-provider.ts) — hybrid AS + JS/TS provider
- [`src/coverage-provider/ast-parser.ts`](../src/coverage-provider/ast-parser.ts) — AST source parsing
- [`src/coverage-provider/containment-matcher.ts`](../src/coverage-provider/containment-matcher.ts) — containment matching
- [`src/coverage-provider/istanbul-converter.ts`](../src/coverage-provider/istanbul-converter.ts) — Istanbul format conversion
- [`src/coverage-provider/coverage-merge.ts`](../src/coverage-provider/coverage-merge.ts) — coverage data merging

---

## Coverage Types

All four Istanbul coverage types are produced from the WASM hit counters and the parsed source structure:

| Type | How it's produced |
|------|--------------------|
| **Function** | Per-function entry counters, matched to source functions by containment ([function matching](#function-matching)) |
| **Branch** | Decision/arm block counters, attributed per construct ([branch matching](#branch-matching)); loops are not reported as branches |
| **Statement** | Block (`expressionHits`) counters, attributed to each source statement by its [entry position](#statement-matching) |
| **Line** | Derived from statement coverage (Istanbul's max-hit-per-start-line) |

---

## Instrumentation

The native C++ addon ([`addon.cpp`](../src/instrumentation/native/addon.cpp)) runs on each compiled WASM binary during the compile phase. It performs three operations:

1. **Debug extraction**: Walk WASM functions with source map data to extract:
    - Function metadata
       - names
       - source positions
       - a [unique representative location](#representative-location) per function (except [generic monomorphizations](#notes-on-position-keys))
    - Basic-block metadata
       - each block's located expressions
       - flag indicating whether it is a *decision* block (see [decision blocks](#decision-blocks))
       - entry anchor expression

2. **Function and block instrumentation**:
- Inject `i32.load`/`i32.store` counter-increment operations at each function entry and also at each instrumented basic block, writing to a dedicated coverage memory.
- Counters use a **two-region layout**: function-entry counters occupy contiguous indices `0..F-1`, block counters follow at `F..F+B-1`

3. **Source map regeneration**: Rebuild the source map with correct offsets, since byte offsets change when instrumentation instructions are injected

### Coverage Memory (Multi-Memory)

Coverage counters are stored in a separate `WebAssembly.Memory` instance (`__coverage_memory` import), isolated from the user's test memory. This uses the [WebAssembly multi-memory proposal](https://github.com/WebAssembly/multi-memory) (V8 12.0+ / Node 22+).

Each instrumented function and basic block is assigned a `coverageMemoryIndex` — an offset into coverage memory where its hit counter lives. Counter increments use native WASM `i32.load`/`i32.store` operations to avoid JS boundary crossing during test execution (coverage memory is read after execution finishes).

Block counters are **entry-anchored**: the increment is injected on the first expression executed when the block is entered, so each counter reflects how many times that block ran. Empty fall-through `switch` cases have no expression to anchor on, so they instead receive a *post-anchored* counter on the named block they fall out of — which yields exact per-case entered counts without edge-splitting.

Coverage memory is sized automatically based on the number of instrumentation counters required.

### Representative Location

Each binary function needs a source location that the coverage provider can use to match it to a source function. The addon's `getRepresentativeLocation()` selects a representative debug location from the function's body expression.

The selection strategy examines the function body directly (not the full CFG expression tree):
- **Load/Store bodies**: Skip — these are compiler-generated class member accessors with no meaningful source locations
- **Block bodies**: Search the block's direct child expressions for the first one with a debug location
- **All bodies**: Check the body expression's own debug location, which takes priority if available

Earlier implementations walked all CFG expressions and filtered by "home file" (to exclude inlined code from other files), but this was simplified when it was determined that the body-level expressions checked are guaranteed to be local to the function.

### Decision Blocks
A block is marked a *decision* block when its CFG node has **two or more out-edges** (`bb->out.size() >= 2`) — branches are identified by this out-edge count, not by looking for `if`/`switch` expressions. That choice is forced by how Binaryen walks the code: its `CFGWalker` processes control-flow nodes like `If` internally and never hands them to the addon's per-expression visitor, so the addon never receives an `If` expression it could flag as a branch. (The only branch-like expression the walker *does* deliver is an unconditional `Break` — a plain jump, not a conditional — so a per-expression "is this a branch?" test would catch nothing useful.) Counting out-edges sidesteps this entirely: two or more successors is a real branch point, whichever expression produced it. This per-block `isDecision` flag, computed once, is the single source of truth — used both to allocate the decision's counter and to identify branches during [matching](#branch-matching).

### Output

The addon returns an `InstrumentationResult`:
- `instrumentedWasm` — the instrumented WASM binary (with coverage counter operations injected)
- `sourceMap` — regenerated source map with correct offsets
- `debugInfo` — `BinaryDebugInfo` containing function metadata grouped by file and position

The TypeScript interface layer ([`addon-interface.ts`](../src/instrumentation/addon-interface.ts)) transforms the addon's raw output (0-based columns, path indexes) into processed format (1-based columns, absolute file paths, grouped by file and position key `"line:column"`). It also handles generic monomorphization collisions — multiple WASM functions that are specializations of the same generic source function (e.g. `closeTo<bool>` and `closeTo<u8>`) are grouped at the same position.

**Key source files:**
- [`src/instrumentation/native/addon.cpp`](../src/instrumentation/native/addon.cpp) — `instrumentForCoverage()`, `getRepresentativeLocation()`
- [`src/instrumentation/addon-interface.ts`](../src/instrumentation/addon-interface.ts) — `instrumentForCoverage()`, `transformDebugInfo()`

---

## Coverage Data Collection & Aggregation

### Per-Test Collection

After each test executes (in a dedicated WASM instance), the test runner reads the **full hit-counter array** from coverage memory and derives five structures from it (in [`coverage-extraction.ts`](../src/wasm-executor/coverage-extraction.ts)):

- **`functionHits`** — per-function entry counts, keyed by each function's `representativeLocation`.
- **`expressionHits`** — per-position hit counts for the located expressions in each instrumented block; the basis for statement and line coverage.
- **`branchHits`** — per-decision-block arm counts (plus a per-decision total), the basis for branch coverage.
- **`emptyCaseHits`** — entered counts for empty fall-through `switch` cases, in a dedicated collision-free map (see [Empty-Case & Decision-Position Channels](#empty-case--decision-position-channels)).
- **`decisionPositions`** — the source positions of binary decision blocks; a structural signal carrying no counts, used to detect compiler-folded branches (same section).

`functionHits` and `expressionHits` share the `CoverageData` shape — a `file → "line:column" → count` map keyed by source position:

```typescript
// CoverageData.hitCountsByFileAndPosition
{
  "/absolute/path/to/source.ts": {
    "10:3": 5,   // source position at line 10, column 3 was hit 5 times
    "25:1": 0,   // source position at line 25, column 1 was not hit
  }
}
```

#### Notes on Position Keys:
- Position keys use the format `"line:column"`
- Functions in most cases will have a *unique* `representativeLocation` source position
- In AssemblyScript, generic functions are monomorphized when compiled to WASM, which means the *same `representativeLocation`* source position is produced by multiple WASM functions, which all map back to the same generic AssemblyScript function. e.g. `closeTo<bool>` and `closeTo<u8>` are separate in WASM, but map back to the same `closeTo<T>` in AS. In this case, their counts are summed to produce the correct generic function hit total
- `branchHits` carries per-arm count arrays *keyed by decision* rather than this position map

### Empty-Case & Decision-Position Channels

Two of the five structures are auxiliary: they exist so branch matching stays correct for two cases the main maps cannot represent.

**`emptyCaseHits`** carries the entered count of each *empty fall-through* `switch` case — a `case` label with no statements of its own that falls through to a later case's body. Such a case has no expression to anchor an entry counter on, so the addon *post-anchors* a counter on the named block it falls out of (see [Instrumentation](#instrumentation)). That count cannot live in `expressionHits` or `branchHits`, because the case-label source position is already occupied in *both* — by the comparison block's own case-label constant (`expressionHits`), and by the previous comparison's false-edge arm (`branchHits`) — each carrying the wrong comparison-chain count. So `emptyCaseHits` is a dedicated `CoverageData` map holding *only* empty-case entries (hence collision-free), keyed by the case-label position (borrowed from the in-edge comparison block's last located expression). Branch matching reads empty cases from here; body cases and explicit defaults still use statement-entry over their body range.

**`decisionPositions`** is the set of source positions, per file, where the binary has a *decision block* (a CFG node with two or more out-edges). It carries no counts — it is purely structural (`{ positionsByFile: Record<file, "line:column"[]> }`). It is the robust signal for **compiler-folded branches**: a constant condition (`if (true)`, `if (1 < 2)`, `const FLAG = true; if (FLAG)`) is evaluated at compile time and emits no decision block at all, whereas a *real* branch always produces one — even when never executed, and even when its arms are mis-located. So a source branch whose condition range contains none of these positions was folded, and is reported from whether each arm's body executed rather than from arm counters (which don't exist for it). Keying on decision *presence* — rather than "no arm matched" — is what avoids confusing a folded branch with a real branch whose unlocated arms were dropped from `branchHits`.

### Per-Suite Aggregation

Coverage data aggregates up the suite tree. After each test completes, its position-keyed maps (`functionHits`, `expressionHits`, `emptyCaseHits`) merge into the parent suite's accumulated coverage via `mergeCoverageData()` (summing counts), its `branchHits` merge via `mergeBranchHits()`, and its `decisionPositions` merge via `mergeDecisionPositions()` — a per-file **union**, since that data is structural rather than counted. After each nested suite completes, its accumulated data merges into the grandparent suite. This bubbles up until the file-level suite holds the merged coverage for all tests in the file.

When a file's tests are complete, the runner calls `onAfterSuiteRun()` with the file-level accumulated data (all five structures, plus a `__format: 'assemblyscript'` marker to distinguish it from JS coverage payloads). This sends the data to the hybrid coverage provider, which combines it across all test files — the same source position compiled into different test binaries accumulates by its stable `file:line:column` key.

### Timeout Resume

When a test times out and execution resumes on a new thread, each suite initializes fresh empty coverage data. Coverage from completed tests is not lost because each completed test's individual coverage data (`meta.functionHits` / `meta.expressionHits` / `meta.branchHits`) is preserved in the task hierarchy across the thread boundary. As `runSuite()` walks through tasks on resume, it skips completed tests' execution but still merges their preserved coverage data into the parent suite — the same merge step that happens during normal execution. This means coverage is reconstructed naturally from children rather than explicitly restored. See [Timeout Architecture](pool-architecture.md#timeout-architecture) in the pool architecture doc for additional details.

**Key source files:**
- [`src/wasm-executor/index.ts`](../src/wasm-executor/index.ts) — `executeWASMTest()` (coverage memory read)
- [`src/pool-thread/runner/test-runner.ts`](../src/pool-thread/runner/test-runner.ts) — `runSuite()`, `runTest()` (per-suite merge)
- [`src/coverage-provider/coverage-merge.ts`](../src/coverage-provider/coverage-merge.ts) — `mergeCoverageData()`

---

## Hybrid Coverage Provider

`HybridCoverageProvider` ([`hybrid-coverage-provider.ts`](../src/coverage-provider/hybrid-coverage-provider.ts)) implements vitest's `CoverageProvider` interface and serves as the unified coverage provider for mixed JS + AS projects.

### How It Works

1. **Initialization**: Creates a delegated v8 coverage provider for JS/TS coverage. Checks for Node version compatibility and native build status, and displays user-facing console warnings if conditions will not allow coverage to actually be collected, despite being enabled.

2. **Accumulation** (`onAfterSuiteRun`): As test files complete:
   - AS payloads (identified by `__format: 'assemblyscript'`): merge `functionHits`/`expressionHits` into accumulated maps via `mergeCoverageData()` and `branchHits` via `mergeBranchHits()`, summing across all test files
   - JS payloads: delegate directly to the v8 provider

3. **Report generation** (`generateCoverage`): Once all tests complete:
   - Parse AS source files (via AST parser) to get function, statement, and branch ranges — the source of truth for what should be covered
   - For each source file: match the accumulated hit positions to those source ranges and convert to Istanbul format (function, branch, statement, and line coverage)
   - Get JS/TS coverage from the delegated v8 provider
   - Merge AS Istanbul `CoverageMap` into JS `CoverageMap` → unified report

4. **Report output** (`reportCoverage`): Delegates to the v8 provider's reporters (HTML, LCOV, JSON, text, etc.)

### Accumulation Key Stability

Accumulating across test files works because every key is a **source position**, which is stable across binaries.
- The position-keyed maps (`functionHits`, `expressionHits`, `emptyCaseHits`) key on `filePath:line:column`, taken from the binary's `BinaryDebugInfo` — a function's `representativeLocation`, a block's located expression, or an empty case's label
- `branchHits` keys each decision on a sorted composite of its arm *positions*
- `decisionPositions` is a per-file set of positions.

Since the same source element compiled into different test binaries always maps back to the same source position, a module imported by many test files accumulates correctly regardless of which binary produced each hit — summed for the count-bearing structures, unioned for `decisionPositions`.

---

## AST Source Parsing

The AST parser ([`ast-parser.ts`](../src/coverage-provider/ast-parser.ts)) runs in the coverage provider during `generateCoverage()`. It parses each source file included by `assemblyScriptInclude` patterns and extracts the source structure that defines what *should* be covered: well-defined functions, branches, and statements (qualified names where applicable, plus source ranges).

The parser uses a `FunctionExtractorVisitor` that walks the AST and extracts:
- **Function declarations** — top-level and nested functions
- **Method declarations** — instance methods, static methods, getters, setters (with naming conventions matching the binary: `ClassName#methodName`, `ClassName.staticMethod`, `ClassName#get:prop`)
- **Arrow functions** — variable declarations with function expression initializers
- **Branches** (via an `onBranch` hook) — `if`/`else` (`if`), ternary (`cond-expr`), logical `&&`/`||` (`binary-expr`), and `switch`, each with its arm ranges
- **Statements** (via an `onStatement` hook on the shared visitor) — each coverable statement kind: variable, expression, `return`, `throw`, `break`, `continue`, and the control-flow statements (`if`, `for`, `while`, `do`, `switch`)

For functions, the parser emits two structures:
1. `functionsByLineSpan`: indexes each function under **every** source line its range spans (`Record<number, ParsedSourceFunctionInfo[]>`) for direct per-line lookup during containment matching. It stores a list because multiple functions can occupy the same line (nested or overlapping definitions)
2. `uniqueFunctions`: holds one record per function keyed by `startLine:startColumn` as the source of truth for the emitted Istanbul function set (so span duplication above aids lookup only, never affecting the function set or hit attribution)

The parsed `branches` and `statements` ride alongside in the same per-file result, consumed by branch and statement matching respectively.

### Why Source Parsing Happens in the Provider

Source parsing is deliberately separated from the execution pipeline. The coverage provider owns the `assemblyScriptInclude` configuration that determines which files should appear in coverage reports. This separation means:
- The execution pipeline collects raw data without needing to know about coverage configuration
- Source files that are never imported by any test still appear in coverage reports (with 0% coverage)
- The source of truth for "what should be covered" is always the AST, not the binary

**Key source files:**
- [`src/coverage-provider/ast-parser.ts`](../src/coverage-provider/ast-parser.ts) — `parseFunctionsFromFile()`, `FunctionExtractorVisitor`
- [`src/util/ast-visitor.ts`](../src/util/ast-visitor.ts) — shared `ASTVisitor` base class

---

## Containment Matching

Containment matching bridges the gap between binary execution data and source code structure. Binary debug info provides **points** (a representative source location per function). Source AST parsing provides **ranges** (start/end line/column per function definition). The matcher finds which source range contains each binary point.

### Why Not Simpler Approaches?

- **Name matching**: Anonymous and nested functions have compiler-generated names (`~anonymous|N`) that can't be reliably recreated from source alone
- **Direct position matching**: The AS compiler generates inconsistent source map positions by statement type — variable declarations point to the keyword, control flow points to the condition expression, inlined default parameters map back to the original definition site

### Function Matching

Functions are indexed under every source line their range spans (see [AST Source Parsing](#ast-source-parsing)), so matching a hit position is a direct lookup rather than a scan. For each binary hit position:
1. Fetch the functions indexed under the hit position's exact line — a direct map lookup
2. Of those, keep the ones whose range actually contains the position (a hit on a spanned line can still fall outside the range by column on the start or end line)
3. If multiple functions contain the position (nested functions), use "tightest fit" — the innermost function (largest start position) wins

This is implemented in `findFunctionContainingPosition()` in [`containment-matcher.ts`](../src/coverage-provider/containment-matcher.ts).

### Performance

Because functions are indexed by every line they span, each hit-position lookup is a direct map access followed by a scan of only the functions present on that one line — typically a single function, a handful where definitions nest or overlap. Total matching cost is therefore roughly linear in the number of unique hit positions to be matched, and independent of the file's total function count.

This replaced an earlier (<= [v0.13.2](https://github.com/themattspiral/vitest-pool-assemblyscript/releases/tag/v0.13.2)) start-line scan that, for every hit position, walked all functions starting at or before that line (and re-materialized the start-line index on each hit). Since hit positions scale with function count, that made file-level matching quadratic — on the order of F²/2 comparisons for F functions. It was negligible for small files (a few thousand operations at 50 functions) but degraded sharply on files with thousands of functions, such as generated or bundled sources.

### Branch Matching

Branches are matched per construct, because AssemblyScript lowers each kind differently:
- **`if` / `cond-expr` (ternary)** — each arm's count comes from its decision block's out-edge target counter, matched to the source arm by the arm's entry position. A missing `else` / implicit arm is derived as `decisionHits − Σ(located arm hits)`, clamped at 0.
- **`binary-expr` (logical `&&` / `||`)** — the left arm is the condition's reached count; the right arm is the count at the right operand's range, which survives only when short-circuit evaluation reaches it.
- **`switch`** — each case's count is the statement-entry count over its *body* range; empty fall-through cases use their post-anchored counter (see [Instrumentation](#instrumentation)); a missing `default` is derived by subtraction.
- **Fused-logical conditions** (`if (a && b)`) have no decision counter of their own, so `decisionHits` is read from the leftmost atom of the condition, which executes unconditionally.
- **Compiler-folded conditions** (e.g. `if (true)`) produce no decision block at all; they are detected by the *absence* of a decision in the condition range and reported from whether each arm's body executed.

Like statement and function matching, branch arms and decision positions are line-indexed (`buildArmsByLine`, `buildDecisionPositionsByLine`), so each per-construct lookup is a direct per-line scan rather than a walk of all branches — keeping total branch matching cost linear in the number of branches and independent of file size. Branch matching lives in `computeBranchPathHits()` and its helpers.

### Statement Matching

A source statement's hit count is the count at its **entry position** — the smallest-position `expressionHit` that falls within the statement's range. The entry expression (a statement's first-executed leaf) runs exactly once per statement execution, so this gives the statement's true execution count rather than the count of a hotter nested expression (e.g. a loop body inside the statement). Hit positions are line-indexed (`buildHitsByLine`) so each lookup is a direct per-line scan, as in function matching (`findStatementEntryHitCount()`).

### Line Coverage
Line coverage is derived from statements: a line's hit count is the maximum over the statements that start on it — exactly Istanbul's `getLineCoverage()` definition.

**Key source files:**
- [`src/coverage-provider/containment-matcher.ts`](../src/coverage-provider/containment-matcher.ts) — `findFunctionContainingPosition()`, `findStatementEntryHitCount()`, `computeBranchPathHits()`, `isPositionInRange()`

---

## Istanbul Conversion & Report Generation

After containment matching, coverage data is converted to Istanbul's `FileCoverageData` format by [`istanbul-converter.ts`](../src/coverage-provider/istanbul-converter.ts). This enables integration with vitest's reporting system and standard coverage tools (Codecov, Coveralls, etc.).

### Building the Istanbul Maps

Hit data is aggregated at two levels:

1. **Per-position** totals are summed first, in multiple places:
  - [across generic monomorphizations](#notes-on-position-keys) - in the executor hit extraction process
  - across tests - via `mergeCoverageData` / `mergeBranchHits`, up the suite tree in the test runner
  - across files/binaries - also via the same `mergeCoverageData` / `mergeBranchHits` logic, but in the hybrid coverage provider for each reported file suite's coverage data (sent in `onAfterSuiteRun`)
  
Each entry in the accumulated hit maps is the complete hit total for one source position across all tests and files.
    
2. **Per-element** (function, branch, statement) totals are then rolled during Istanbul format conversion, where the provider generates a map based on parsed source and fills in the correct hit counts.

For each source file, the converter builds all four Istanbul structures from the parsed source ranges and the accumulated hits:
- **Functions** (`fnMap` / `f`): each source function's count is the combined total of the position(s) in its range (normally its single `representativeLocation`), found via [function matching](#function-matching)
- **Branches** (`branchMap` / `b`): each branch's per-arm counts come from [branch matching](#branch-matching)
- **Statements** (`statementMap` / `s`): each source statement's count is its [entry-position](#statement-matching) hit count
- **Lines**: Istanbul derives line coverage from the statement map (max hit per start line), so faithfully populating `statementMap` / `s` yields line coverage automatically

Istanbul uses 0-based columns while our internal representation uses 1-based, so the converter adjusts column values during conversion.

### Merging with JS/TS Coverage

The hybrid provider merges the AS Istanbul `CoverageMap` into the JS `CoverageMap` from the delegated v8 provider using `jsCoverage.merge(asCoverageMap.toJSON())`. The `toJSON()` call avoids `instanceof` failures that can occur when `istanbul-lib-coverage` is loaded from different module resolution paths.

The merged `CoverageMap` is then passed to the v8 provider's `reportCoverage()`, which generates reports in all configured formats (HTML, LCOV, JSON, text).

**Key source files:**
- [`src/coverage-provider/istanbul-converter.ts`](../src/coverage-provider/istanbul-converter.ts) — `convertToIstanbulFormat()`
- [`src/coverage-provider/hybrid-coverage-provider.ts`](../src/coverage-provider/hybrid-coverage-provider.ts) — `generateCoverage()`, `reportCoverage()`

---

## Coverage Configuration

The hybrid coverage provider adds custom configuration options to vitest's coverage config via **TypeScript module augmentation**. [`custom-provider-options.ts`](../src/config/custom-provider-options.ts) extends vitest's `CustomProviderOptions` interface with our `HybridProviderOptions` fields:

- `assemblyScriptInclude` — glob patterns for AS source files to include in coverage (e.g. `['assembly/**/*.ts']`)
- `assemblyScriptExclude` — glob patterns for AS source files to exclude from coverage
- `debugIstanbul` — enable verbose Istanbul conversion logging

The augmentation is loaded automatically as a side-effect import when users import from the `./config` or `./v3/config` entry points (e.g. `import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config'`). This gives users full type-checking and IDE autocomplete for AS-specific coverage options alongside standard vitest coverage options, without requiring any additional configuration.

All standard vitest v8 coverage provider options (thresholds, reporters, `include`/`exclude` for JS) are also available and delegated to the v8 provider.

**Key source files:**
- [`src/config/custom-provider-options.ts`](../src/config/custom-provider-options.ts) — module augmentation
- [`src/util/resolve-config.ts`](../src/util/resolve-config.ts) — pool option defaults and validation

---

## Key Architectural Decisions

1. **Containment-based matching over name or position matching** — Simpler approaches failed due to anonymous function naming and inconsistent compiler source map positions. Containment matching is robust against these variations. See [Containment Matching](#containment-matching).

2. **Source parsing in the coverage provider, not the execution pipeline** — The provider owns the `assemblyScriptInclude` configuration. This separates raw data collection from interpretation, and ensures uncovered source files (never imported by tests) still appear in reports.

3. **Separate coverage memory (multi-memory)** — Coverage counters in their own `WebAssembly.Memory` isolate them from user test memory. No conflicts, no user memory layout changes, and counter increments are native WASM operations with no JS boundary crossing.

4. **Hybrid provider with v8 delegation** — A single coverage provider handles both AS and JS/TS coverage by delegating JS work to vitest's built-in v8 provider and merging results. This gives users a single configuration point and unified reports.

5. **Native C++ addon for instrumentation** — Binaryen's C++ API provides the WASM manipulation capabilities needed for instrumentation and source map regeneration. [`binaryen.js`](https://github.com/AssemblyScript/binaryen.js), the excellent JS Binaryen port from the AssemblyScript team, unfortunately can't regenerate source maps after modification for instrumentation, meaning we would break our ability to source-map errors whenever we instrument otherwise. While this does require platform-dependant native code, the project has setup a robust platform support matrix for most common platforms, and will fallback to source compilation gracefully, and fallback from there to tests-only (no coverage) as a final measure.

---

## Fidelity & Known Divergences

AssemblyScript coverage is a **gcov-like, compiled-output measurement** (counts of executed WASM blocks), not source-level instrumentation. It is matched back to source ranges so it can be reported in Istanbul's format alongside JavaScript coverage, but the counts reflect what the *compiled* program actually executed. The **fidelity contract** is: covered-vs-uncovered is always correct; exact hit *counts* are best-effort where AssemblyScript's lowering diverges from source structure.

Most coverage is exact and matches what V8 reports for the equivalent JavaScript. The known divergences are all verified against V8 and pinned in the meta-verify suite. These are the following:

1. **`while` / `do-while` header count** — AssemblyScript counts the loop's condition block, which evaluates N+1 times for N iterations; V8 counts the statement once. Covered/uncovered agrees; only the count differs. (`for` does not diverge — its entry is the once-run init.)
   - *Example:* a `while (i < n) { i++; }` that runs 3 times reads **4** on the `while` line in AssemblyScript (3 passes + the final false check), **1** in V8.
2. **Default-less `switch`** — AssemblyScript synthesizes the implicit "no case matched" default arm (matching istanbul's source-instrumentation convention, checked against `istanbul-lib-instrument`); V8's block-coverage conversion omits it. The real cases agree. (Note the asymmetry: an `if` without `else` does *not* diverge — V8 does emit the implicit-else arm.)
   - *Example:* `switch (x) { case 1: …; case 2: …; }` with no `default` — AssemblyScript reports **three** branch arms (the two cases + a synthesized implicit default), V8 reports the **two** real cases.
   - *How its count is derived (and a best-effort residual):* the synthesized default's hit count is `switch-reached − distinct case matches`, where *distinct matches* sums only the **group-terminal** cases' entered counts (a fall-through case's matches already telescope into the entered count of the terminal case it flows into, so summing every case would double-count the fall-through). This is exact for empty fall-through cases and body cases with an unconditional `break`/`return`/`throw`/`continue`. The one residual: a **conditional** break (`if (c) break;`) makes a case's fall-through runtime-dependent while the classification is static, so the synthesized default's count for such a case is off by the number of entries that conditionally broke out. Per the fidelity contract this is best-effort; the explicit case arms are unaffected, and there is no V8 oracle for the synthesized arm anyway.
3. **Chained logical `a && b && c`** — AssemblyScript reports two nested 2-arm branches; V8 (like `istanbul-lib-instrument`) flattens the chain into one 3-arm branch. Per-operand counts and covered/uncovered agree; only the grouping differs.
   - *Example:* `return a && b && c;` with `a` true 3×, `b` true 2×, `c` true 1× — AssemblyScript `[3, 2]` (inner `a && b`) + `[3, 1]` (outer), V8 one `[3, 2, 1]`.
4. **`static` method hit count** — reports **0** in AssemblyScript (entry counting — execution-accurate), but the merged V8/JS report shows a JS static method's count as the *class-definition* count (≈1) regardless of its real call count. The `1` is **not** from V8 execution — raw V8 reports an uncalled method as 0 — it appears to be a bug in vitest's AST-aware coverage remapper (`ast-v8-to-istanbul`, the default in v4/v5): the remapper looks up a method's hit count at the `MethodDefinition` node's start offset, which for a `static` method is the `static` keyword. V8 starts a static method's coverage range at the method *name*, so the `static` keyword sits *outside* it, and the lookup falls through to the enclosing class/module range (executed once when the class is defined). The result: an uncalled static reads 1 (should be 0) **and** a static called N times reads ~1 (should be N). Instance methods, getters, and setters are unaffected (their ranges start at/before the lookup offset). AssemblyScript's value is the execution-accurate one.
   - *Example:* `class C { static make(): C { … } }` with `make` never called — AssemblyScript reports `C.make` as **0** (uncovered, correct); the merged report shows **1** (covered).
5. **`cond ? const : const` ternary** — when *both* arms are compile-time constants, AssemblyScript collapses the ternary to a single result constant — nothing is left in the compiled output to count — and reports `[0, 0]`; V8 reports `[1, 0]`. This is an "erased → blind" case: the same blindness as a folded `select` or a default argument. A ternary with a non-constant arm (`ok ? compute() : 0`) is reported correctly.
   - *Example:* `const label = ok ? "yes" : "no";` — both arms read `[0, 0]` (uncovered) in AssemblyScript, `[1, 0]` in V8.

> ℹ️ **Module-level declarations are credited by synthesis (matching V8).** A module-scope `const`/`let` whose initializer folds to a WASM-global init expression (`const TABLE_SIZE = 1024;` → `(global … (i32.const 1024))`) has no runtime block to count, so on its own it would read 0. But a module's top-level code runs at instantiation, so the provider credits such declarations as covered for any source file that was *loaded* (compiled into an executed binary) — bringing them to parity with V8, which counts the declaration once. This is the one **synthesized** value in an otherwise measured, gcov-like model; covered/uncovered is correct, and a *non-constant* initializer (`let x = compute()`) is measured normally. A never-imported included file stays fully uncovered (it never loaded), preserving the zero-hit case.

> ℹ️ **Switch case highlight location (presentation only — *not* a count divergence).** For `switch`, AssemblyScript locates each non-empty case arm at the case *body* (it highlights the executable code), while V8 locates every arm at the `case X:` label. Only the span the HTML report highlights differs — per-arm counts, covered/uncovered, branch %, and thresholds are all identical. (Empty fall-through cases already match V8 at the label, since their counter is attributed to the case-label position.)

---

## Verification & Parity Oracle

Coverage correctness is verified two ways:

- **Hand-derived assertions** — the meta-verify suite ([`test/meta-verify/coverage-collection/`](../test/meta-verify/coverage-collection/)) asserts exact per-function / per-statement / per-branch counts derived independently from each fixture and the tests that exercise it, organized by coverage type (`function/`, `statement/`, `branch/`, `summary/`).
- **JS↔AS parity twins** — for the universal constructs, each AssemblyScript fixture has a **line-aligned JavaScript twin** with identical logic and identical test inputs. Both the AssemblyScript coverage (our provider) and the JavaScript coverage (vitest's V8 provider, which the hybrid provider delegates to) land in the *same* merged `coverage-final.json`, so a parity test reads both and asserts they agree (except at the documented divergences above, each pinned explicitly). **V8 is the authoritative oracle** (it is what sits next to our coverage in a real mixed report).

### Out-of-Root Source Files

Our provider can report a *never-imported* AS source fully (all-uncovered, straight from the AST), but the V8 provider cannot do the same for a never-imported, out-of-root JS file — so the "zero-hit" parity case has no JS oracle to compare against and is verified AS-only. The *imported* twins are unaffected, since they rely on runtime coverage rather than the uncovered-file transform.

The same caveat applies to users: in a multi-project setup whose `coverage` config points at sources outside every project root, expect those files in the AS report but not necessarily in the merged JS report.

This happens because vitest's V8 provider can only *transform* (strip types from) source files *inside a project's root*, because it must be in the root to be processed by vite. A source file referenced from outside all project roots — e.g. a file imported via a `../` path from a sibling install — is reported only when it is actually imported and executed (runtime coverage); a never-imported out-of-root file cannot be transformed and is dropped from V8's report.

`coverage.allowExternal: true` relaxes the *reporting* filter but not the transformer. The AssemblyScript provider is unaffected: it parses its included sources directly with the AssemblyScript parser, so uncovered AS sources are always reported regardless of their location relative to the project root.
