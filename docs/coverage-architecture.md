# Coverage Architecture

This document describes the coverage system of `vitest-pool-assemblyscript`: how WASM execution is instrumented, how hit data is collected and aggregated, how binary hit positions are matched to source code, and how the hybrid coverage provider produces unified reports. For overall pool architecture, see [Pool Architecture](pool-architecture.md).

---

**Table of Contents**
- [Overview](#overview)
- [Instrumentation](#instrumentation)
- [Coverage Data Collection & Aggregation](#coverage-data-collection--aggregation)
- [Hybrid Coverage Provider](#hybrid-coverage-provider)
- [AST Source Parsing](#ast-source-parsing)
- [Containment Matching](#containment-matching)
- [Istanbul Conversion & Report Generation](#istanbul-conversion--report-generation)
- [Coverage Configuration](#coverage-configuration)
- [Key Architectural Decisions](#key-architectural-decisions)
- [Planned: Block-Level Coverage](#planned-block-level-coverage)

---

## Overview

Coverage works by instrumenting compiled WASM binaries to count function entries, then matching those binary hit positions back to source code via containment matching. The system produces standard Istanbul coverage data that integrates with vitest's reporters.

```
    Compile Thread                Test Thread               Coverage Provider
    (per test file)        (per test file + resume)      (once per overall run)
┌─────────────────────┐     ┌────────────────────┐     ┌────────────────────────┐
│ AS → WASM           │     │ Per-test execution │     │ Parse AS source        │
│ Native addon:       │     │ in fresh instance  │     │   AST → func ranges    │
│  - extract          │ ──> │                    │ ──> │                        │
│  - instrument       │     │ Read hit counters  │     │ Containment match      │
│  - regen source map │     │ from coverage mem  │     │   Binary hit loc → src │
│                     │     │                    │     │     function range     │
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

## Instrumentation

The native C++ addon ([`addon.cpp`](../src/instrumentation/native/addon.cpp)) runs on each compiled WASM binary during the compile phase. It performs three operations:

1. **Debug extraction**: Walk WASM functions with source map data to extract function metadata — names, source positions, and a representative source location for each function
2. **Function-entry instrumentation**: Inject `i32.load`/`i32.store` counter-increment operations at each function entry point, writing to a dedicated coverage memory
3. **Source map regeneration**: Rebuild the source map with correct offsets, since byte offsets change when instructions are injected

### Coverage Memory (Multi-Memory)

Coverage counters are stored in a separate `WebAssembly.Memory` instance (`__coverage_memory` import), isolated from the user's test memory. This uses the [WebAssembly multi-memory proposal](https://github.com/WebAssembly/multi-memory) (V8 12.0+ / Node 22+).

Each instrumented function is assigned a `coverageMemoryIndex` — an offset into coverage memory where its hit counter lives. Counter increments use native WASM `i32.load`/`i32.store` operations with no JS boundary crossing during test execution.

Coverage memory is sized automatically based on the number of instrumentation counters required.

### Representative Location

Each binary function needs a source location that the coverage provider can use to match it to a source function. The addon's `getRepresentativeLocation()` selects a representative debug location from the function's body expression.

The selection strategy examines the function body directly (not the full CFG expression tree):
- **Load/Store bodies**: Skip — these are compiler-generated class member accessors with no meaningful source locations
- **Block bodies**: Search the block's direct child expressions for the first one with a debug location
- **All bodies**: Check the body expression's own debug location, which takes priority if available

Earlier implementations walked all CFG expressions and filtered by "home file" (to exclude inlined code from other files), but this was simplified when it was determined that the body-level expressions checked are guaranteed to be local to the function.

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

After each test executes in a fresh WASM instance, the test runner reads hit counters from coverage memory. Each function's `coverageMemoryIndex` (from `BinaryDebugInfo`) maps to an offset in coverage memory where the counter value lives. The result is a `CoverageData` object:

```typescript
// CoverageData.hitCountsByFileAndPosition
{
  "/absolute/path/to/source.ts": {
    "10:3": 5,   // function at line 10, column 3 was hit 5 times
    "25:1": 0,   // function at line 25, column 1 was not hit
  }
}
```

Position keys use the format `"line:column"` derived from the function's `representativeLocation` in the binary debug info.

### Per-Suite Aggregation

Coverage data aggregates up the suite tree using `mergeCoverageData()`. After each test completes, its coverage data merges into the parent suite's accumulated coverage. After each nested suite completes, its accumulated data merges into the grandparent suite. This bubbles up until the file-level suite has the merged coverage for all tests in the file.

When a file's tests are complete, the runner calls `onAfterSuiteRun()` with the file-level accumulated `CoverageData` (plus a `__format: 'assemblyscript'` marker to distinguish it from JS coverage payloads). This sends the data to the hybrid coverage provider.

### Timeout Resume

When a test times out and execution resumes on a new thread, each suite initializes fresh empty coverage data. Coverage from completed tests is not lost because each completed test's individual `meta.coverageData` is preserved in the task hierarchy across the thread boundary. As `runSuite()` walks through tasks on resume, it skips completed tests' execution but still merges their preserved coverage data into the parent suite — the same merge step that happens during normal execution. This means coverage is reconstructed naturally from children rather than explicitly restored. See [Timeout Architecture](pool-architecture.md#timeout-architecture) in the pool architecture doc.

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
   - AS payloads (identified by `__format: 'assemblyscript'`): merge `CoverageData` into an accumulated map using `mergeCoverageData()`, summing hit counts by file and position across all test files
   - JS payloads: delegate directly to the v8 provider

3. **Report generation** (`generateCoverage`): Once all tests complete:
   - Parse AS source files (via AST parser) to get function ranges — the source of truth for what should be covered
   - For each source file: run containment matching (binary hit positions → source function ranges) and convert to Istanbul format
   - Get JS/TS coverage from the delegated v8 provider
   - Merge AS Istanbul `CoverageMap` into JS `CoverageMap` → unified report

4. **Report output** (`reportCoverage`): Delegates to the v8 provider's reporters (HTML, LCOV, JSON, text, etc.)

### Accumulation Key Stability

Coverage data is keyed by source file path + position (`"line:column"`). These keys come from the binary's `BinaryDebugInfo`, where each function's `representativeLocation` points to a stable source position. The same source function compiled into different test binaries will produce the same `filePath:line:column` key, enabling correct accumulation across test files that import the same source modules.

---

## AST Source Parsing

The AST parser ([`ast-parser.ts`](../src/coverage-provider/ast-parser.ts)) runs in the coverage provider during `generateCoverage()`. It parses each source file included by `assemblyScriptInclude` patterns and extracts function metadata: qualified names, short names, and source ranges (start/end line/column).

The parser uses a `FunctionExtractorVisitor` that walks the AST and extracts:
- **Function declarations** — top-level and nested functions
- **Method declarations** — instance methods, static methods, getters, setters (with naming conventions matching the binary: `ClassName#methodName`, `ClassName.staticMethod`, `ClassName#get:prop`)
- **Arrow functions** — variable declarations with function expression initializers

The parser emits two structures (`ParsedSourceFunctions`): `functionsByLineSpan` indexes each function under **every** source line its range spans (`Record<number, ParsedSourceFunctionInfo[]>`) for direct per-line lookup during containment matching, and `uniqueFunctions` holds one record per function keyed by `startLine:startColumn` as the source of truth for the emitted Istanbul function set. The per-line index stores a list because multiple functions can occupy the same line (nested or overlapping definitions).

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

### Algorithm

Functions are indexed under every source line their range spans (see [AST Source Parsing](#ast-source-parsing)), so matching a hit position is a direct lookup rather than a scan. For each binary hit position:
1. Fetch the functions indexed under the hit position's exact line — a direct map lookup
2. Of those, keep the ones whose range actually contains the position (a hit on a spanned line can still fall outside the range by column on the start or end line)
3. If multiple functions contain the position (nested functions), use "tightest fit" — the innermost function (largest start position) wins

This is implemented in `findFunctionContainingPosition()` in [`containment-matcher.ts`](../src/coverage-provider/containment-matcher.ts).

### Performance

Because functions are indexed by every line they span, each hit-position lookup is a direct map access followed by a scan of only the functions present on that one line — typically a single function, a handful where definitions nest or overlap. Total matching cost is therefore roughly linear in the number of hit positions and independent of the file's total function count.

This replaced an earlier (<= [v0.13.2](https://github.com/themattspiral/vitest-pool-assemblyscript/releases/tag/v0.13.2)) start-line scan that, for every hit position, walked all functions starting at or before that line (and re-materialized the start-line index on each hit). Since hit positions scale with function count, that made file-level matching quadratic — on the order of F²/2 comparisons for F functions. It was negligible for small files (a few thousand operations at 50 functions) but degraded sharply on files with thousands of functions, such as generated or bundled sources.

The tradeoff is index size: a function occupies one slot per line it spans, so `functionsByLineSpan` is proportional to the total source lines covered by functions rather than to the function count — still linear in file size, and built once per file during parsing. The separate `uniqueFunctions` map (keyed by `startLine:startColumn`) holds one record per function as the source of truth for the emitted Istanbul function set, so span duplication affects lookup only, never the function set or hit attribution.

**Key source files:**
- [`src/coverage-provider/containment-matcher.ts`](../src/coverage-provider/containment-matcher.ts) — `findFunctionContainingPosition()`, `isPositionInRange()`

---

## Istanbul Conversion & Report Generation

After containment matching, coverage data is converted to Istanbul's `FileCoverageData` format by [`istanbul-converter.ts`](../src/coverage-provider/istanbul-converter.ts). This enables integration with vitest's reporting system and standard coverage tools (Codecov, Coveralls, etc.).

### Current Conversion (Function-Level)

Hit data is aggregated at two distinct levels. **Per-position** totals are summed first — across monomorphizations (in the executor) and across tests and binaries (via `mergeCoverageData`, up the suite tree and in the provider) — so each entry in the accumulated position map is the complete hit total for one source position. **Per-function** totals are then rolled up here, at conversion: each source function's count is the combined total of the position(s) that fall in its range, normally just its single `representativeLocation`.

For each source file:
1. **Match**: For each binary hit position (already a per-position total), use containment matching to find the containing source function, and roll the position(s) up into that function's hit count
2. **Convert**: For each source function (from AST parser), create:
   - A function mapping (`fnMap`) with the function's source range
   - A corresponding statement mapping (`statementMap`) with the same range — at function-level granularity, each function is treated as one "statement"
   - Hit counts in `f` and `s` arrays (statement coverage mirrors function coverage)
3. **Empty maps**: Branch map (`branchMap`, `b`) is empty — no branch coverage yet

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

## Planned: Block-Level Coverage

The current implementation provides function-level coverage. Block-level coverage will upgrade this to all four Istanbul coverage types: function, statement, branch, and line.

### Planned Changes

**Instrumentation upgrade**: The native addon will additionally inject counters at basic block boundaries, and extract expression/block position debug info alongside function metadata. Function coverage is expected to keep using the existing per-function counters and matching.

**Statement matching**: For each source statement (from AST), check if any hit position falls within its range. Hit positions will be line-indexed for O(1) per-line lookups. This "interval → points" query direction is more efficient than the reverse: for a typical file with 300 statements, ~1,800 operations vs ~90,000 for the naive approach, without needing complex data structures like interval trees.

**Branch matching**: Per-path hit counts are derived from counters on each branch path's target basic block (identified via CFG analysis). Binary branch decisions and paths are matched back to source branch constructs using containment matching, like function matching today. The exact set of branch constructs reported (and how closely it follows Istanbul's conventions) is still being finalized.

### Coverage Types by Version

| Type | Current | Planned |
|------|---------|---------|
| Function | Per-function counters, containment matching | Unchanged |
| Statement | Derived from functions (function = one statement) | Block counters → expression positions, line-indexed range matching |
| Branch | Not implemented (0%) | Target-block counters, containment matching |
| Line | Derived from functions | Derived from statements |
