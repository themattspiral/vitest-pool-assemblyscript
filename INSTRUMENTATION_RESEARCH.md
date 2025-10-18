# AssemblyScript Instrumentation Research

## Research Date
October 17, 2025

## Source
assemblyscript-unittest-framework v1.4.0

---

## Executive Summary

The assemblyscript-unittest-framework uses a **two-phase approach** to coverage instrumentation:

1. **Phase 1 (Build-Time)**: AS Transform extracts function metadata (name, line ranges)
2. **Phase 2 (Post-Compile)**: WASM Instrumentation injects trace calls into compiled WASM binary

This is **DIFFERENT** from what we initially planned. They don't inject AS code during compilation - they **modify the WASM binary after compilation**.

---

## Detailed Findings

### 1. AS Transform: Function Metadata Extraction

**File**: `node_modules/assemblyscript-unittest-framework/transform/listFunctions.mjs`

**Purpose**: Extract function names and line ranges from AS source during compilation

**How It Works**:
```typescript
class SourceFunctionTransform extends Transform {
  afterInitialize(program) {
    // Visit all user source files (not stdlib)
    program.sources
      .filter(source => source.sourceKind === SourceKind.UserEntry && !source.normalizedPath.startsWith("~lib/"))
      .forEach(source => {
        // Extract function information
        this.visitNode(source);

        // Store globally for later use
        globalThis.__functionInfos = functionInfos;
      });
  }

  visitFunctionDeclaration(node) {
    // Extract function metadata
    this.functionInfos.push({
      name: element.internalName ?? node.name.text,
      range: [startLine, endLine],
    });
  }
}
```

**What It Extracts**:
- Function name (including internal names for generics)
- Line range: `[startLine, endLine]`
- Filters out: constructors without statements, ambient functions, abstract functions

**Key Insight**: This transform does NOT inject any code - it only **collects metadata**.

---

### 2. WASM Binary Instrumentation

**File**: `node_modules/assemblyscript-unittest-framework/dist/core/instrument.js`

**Purpose**: Inject coverage trace calls into WASM binary AFTER compilation

**How It Works**:
```javascript
export async function instrument(sourceWasms, sourceCodePaths, collectCoverage) {
  const instrumenter = await initInstrumenter();

  for (const sourceFile of sourceWasms) {
    const reportFunction = "__unittest_framework_env/traceExpression";

    // Call WASM instrumentation tool
    instrumenter._wasm_instrument(
      source,         // Input WASM binary
      output,         // Output instrumented WASM
      report,         // Trace function name
      sourceMap,      // Output source map
      expectInfo,     // Debug info for expectations
      debugInfo,      // Output debug info
      include,        // Filter regex
      0,              // Unknown parameter
      true,           // Unknown parameter
      collectCoverage // Enable/disable coverage
    );
  }
}
```

**The Instrumentation Tool**: `build_wasm/bin/wasm-instrumentation.js` (6.7MB WASM module!)

**What It Does**:
1. Reads compiled WASM binary
2. Injects calls to `__unittest_framework_env/traceExpression` at **every basic block**
3. Generates debug info mapping: `(functionIndex, basicBlockIndex) → (fileIndex, lineNumber)`
4. Outputs: instrumented WASM + source map + debug info JSON

**Key Insight**: This is **POST-compilation** instrumentation, not AS-level instrumentation.

---

### 3. Runtime Trace Collection

**File**: `node_modules/assemblyscript-unittest-framework/dist/core/covRecorder.js`

**Purpose**: Collect coverage traces during WASM execution

**How It Works**:
```javascript
export class CoverageRecorder {
  _runtimeTrace = [];

  getCollectionFuncSet() {
    return {
      traceExpression: (functionIndex, basicBlockIndex, type) => {
        switch (type) {
          case 0: { // Basic block execution
            this._runtimeTrace.push([functionIndex, basicBlockIndex]);
            break;
          }
          case 1: // Call in (not used)
          case 2: // Call out (not used)
            break;
        }
      },
    };
  }

  outputTrace(traceFile) {
    writeFileSync(traceFile, JSON.stringify(this._runtimeTrace));
  }
}
```

**WASM Import Setup**:
```javascript
const importObject = {
  __unittest_framework_env: {
    ...executionRecorder.getCollectionFuncSet(),
    ...mockStatusRecorder.getMockFuncSet(),
    ...coverageRecorder.getCollectionFuncSet(), // <-- traceExpression here
  },
  ...userDefinedImportsObject,
};
```

**Trace Format**: `[[funcIdx, blockIdx], [funcIdx, blockIdx], ...]`

**Key Insight**: The trace is just pairs of integers collected during execution.

---

### 4. Debug Info → Source Line Mapping

**File**: `node_modules/assemblyscript-unittest-framework/dist/parser/index.js`

**Purpose**: Convert traces to line/branch coverage using debug info

**How It Works**:
```javascript
async traceParse(instrumentResult) {
  // Load traces: [[funcIdx, blockIdx], ...]
  const tempCovTraceMap = await this.getTempCovTraceMap(instrumentResult.traceFile);

  // Load debug info generated by instrumenter
  const { debugInfos, debugFiles } = await this.getDebugInfos(instrumentResult.debugInfo);

  // debugInfos structure:
  // Map<functionName, {
  //   index: number,
  //   lineInfo: Array<Array<[fileIndex, lineNumber]>>, // Per basic block
  //   branchInfo: ...
  // }>

  for (const [name, info] of debugInfos) {
    const traces = tempCovTraceMap.get(info.index);
    if (traces !== undefined) {
      // Map basic block indices to line numbers
      info.lineInfo.forEach((ranges, index) => {
        const lineInfoArray = ranges
          .filter(range => {
            const filename = debugFiles[range[0]];
            // Filter out inline functions from other files
            return checkFunctionName(filename, name);
          })
          .map(range => range[1]); // Extract line number

        lineInfoMap.set(index, new Set(lineInfoArray));
      });
    }
  }
}
```

**Debug Info Structure**:
```typescript
{
  debugFiles: string[],  // File paths indexed by fileIndex
  debugInfos: Map<string, {
    index: number,  // Function index
    lineInfo: Array<  // Per basic block
      Array<[fileIndex, lineNumber]>  // Lines in this block
    >,
    branchInfo: ...
  }>
}
```

**Coverage Calculation**:
1. For each trace `[funcIdx, blockIdx]`:
   - Look up function name by `funcIdx` in debug info
   - Look up line numbers by `blockIdx` in `lineInfo[blockIdx]`
   - Mark those lines as covered

**Key Insight**: Debug info provides the critical mapping from WASM execution to AS source lines.

---

## Architectural Implications for Our Framework

### Option A: Use Their Approach (WASM Post-Processing)

**Pros**:
- ✅ Proven to work (they've solved all the edge cases)
- ✅ Can reuse their `wasm-instrumentation.js` tool
- ✅ No need to understand AS compiler internals deeply
- ✅ Handles all AS language features (generics, inline, etc.)

**Cons**:
- ❌ Dependency on 6.7MB WASM binary (adds weight)
- ❌ Two-pass process (compile → instrument)
- ❌ Less control over instrumentation strategy
- ❌ May not support our goal of per-test coverage snapshots easily

### Option B: AS Transform Instrumentation (Our Original Plan)

**Pros**:
- ✅ Single-pass (instrument during compilation)
- ✅ More control over what gets instrumented
- ✅ Lighter weight (no external WASM dependency)
- ✅ Can inject code at AS level (clearer semantics)

**Cons**:
- ❌ Need to implement transform ourselves
- ❌ Must handle all AS edge cases (generics, inline, etc.)
- ❌ No existing proven implementation to reference
- ❌ More complex debugging

### Option C: Hybrid Approach

**Pros**:
- ✅ Use AS transform for simple trace injection
- ✅ Use their debug info format for compatibility
- ✅ Lighter weight than full WASM post-processing
- ✅ Can leverage their parser logic

**Cons**:
- ⚠️ Need to ensure our traces match their debug info format
- ⚠️ Still need to implement transform ourselves

---

## Recommended Approach

**Start with Option B (AS Transform), with fallback to Option A**

### Rationale:
1. **We're building from scratch anyway** - no legacy to maintain
2. **Single-pass is cleaner** - fits better with Vitest plugin model
3. **We want per-test coverage** - easier with in-process trace collection
4. **Learning opportunity** - understand AS compiler deeply
5. **Lightweight** - no 6.7MB WASM dependency

### Minimal Viable Implementation:

**Step 1**: Create AS transform that injects trace calls
```typescript
// In AS source:
function add(a: i32, b: i32): i32 {
  return a + b;
}

// After transform:
function add(a: i32, b: i32): i32 {
  __coverage_trace(FUNC_INDEX, 0); // Block 0: function entry
  return a + b;
}
```

**Step 2**: Collect debug info during compilation
- Map function names → indices
- Map basic block indices → line numbers
- Store in JSON format similar to their debug info

**Step 3**: Implement trace collector (similar to theirs)
```typescript
const traces: [number, number][] = [];

const imports = {
  env: {
    __coverage_trace: (funcIdx: number, blockIdx: number) => {
      traces.push([funcIdx, blockIdx]);
    }
  }
};
```

**Step 4**: Map traces to coverage
- Load debug info
- For each `[funcIdx, blockIdx]` trace:
  - Look up function name
  - Look up line numbers
  - Mark lines as covered

---

## Critical Questions to Answer

1. **How do we extract debug info from AS compiler?**
   - Check if `asc.main()` provides debug info in result
   - Or parse WASM binary for debug sections
   - Or build during transform

2. **How do we inject function/block indices?**
   - Need to assign unique indices during transform
   - Store mapping in debug info JSON

3. **How do we handle per-test coverage snapshots?**
   - Clear traces before each test?
   - Or use timestamps/test IDs?
   - Or calculate deltas (current - previous)?

4. **How do we handle inline functions?**
   - Follow their approach: filter out cross-file inlines
   - Or: strip @inline first (as planned)

---

## Next Steps

1. **Implement minimal AS transform** that:
   - Visits function declarations
   - Injects `__coverage_trace(funcIdx, 0)` at function entry
   - Builds debug info mapping

2. **Test with simple AS file**:
   ```typescript
   function add(a: i32, b: i32): i32 {
     return a + b;
   }

   function multiply(a: i32, b: i32): i32 {
     return a * b;
   }
   ```

3. **Verify trace collection works**:
   - Compile with transform
   - Instantiate WASM with `__coverage_trace` import
   - Call functions
   - Check traces: `[[0, 0], [1, 0]]` (func 0 block 0, func 1 block 0)

4. **Verify debug info mapping works**:
   - Map trace `[0, 0]` → "add", line X
   - Map trace `[1, 0]` → "multiply", line Y

5. **Expand to statement-level coverage** (later):
   - Inject traces at every statement
   - Handle branches, loops, etc.

---

## Code Examples from Their Implementation

### Transform Output Format
```typescript
// globalThis.__functionInfos format:
Map<string, Array<{
  name: string,      // e.g., "add" or "Map<i32,string>#set"
  range: [number, number]  // [startLine, endLine]
}>>
```

### Debug Info Format
```json
{
  "debugFiles": [
    "/path/to/source.ts",
    "/path/to/other.ts"
  ],
  "debugInfos": {
    "add": {
      "index": 0,
      "lineInfo": [
        [[0, 10], [0, 11]],  // Block 0: lines 10-11 in file 0
        [[0, 12]]             // Block 1: line 12 in file 0
      ],
      "branchInfo": { ... }
    },
    "multiply": {
      "index": 1,
      "lineInfo": [
        [[0, 15], [0, 16]]   // Block 0: lines 15-16 in file 0
      ],
      "branchInfo": { ... }
    }
  }
}
```

### Trace File Format
```json
[
  [0, 0],  // Function 0, block 0
  [0, 1],  // Function 0, block 1
  [1, 0],  // Function 1, block 0
  [0, 0]   // Function 0, block 0 again
]
```

---

## Conclusion

The assemblyscript-unittest-framework uses **WASM post-processing** to instrument binaries, which is powerful but heavy. For our Vitest plugin, an **AS transform-based approach** is more appropriate because:

1. **Simpler integration** - single compilation pass
2. **Lighter weight** - no 6.7MB WASM dependency
3. **Better control** - inject exactly what we need
4. **Per-test coverage** - easier to implement with in-process traces

We can implement a minimal viable transform that injects trace calls at function entry points, then expand to statement/branch coverage later.

**The path forward is clear**: Implement AS transform instrumentation next.
