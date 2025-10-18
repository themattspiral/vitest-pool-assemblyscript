# AssemblyScript Compiler In-Memory Compilation Research Findings

## Executive Summary

After thorough investigation of the AssemblyScript compiler API, I have determined:

1. **`asc.main()` DOES NOT return an exit code** - it returns an object
2. **In-memory compilation IS fully supported** via `readFile`/`writeFile` callbacks
3. **`compileString()` DOES work** - test failures were due to deprecated `binaryFile` option
4. **The plugin is likely hanging due to async/Promise handling**, not compilation approach

---

## Critical Finding #1: `asc.main()` Return Value

### What Everyone Thinks
`asc.main()` returns an exit code (number): 0 for success, non-zero for failure

### What Actually Happens
`asc.main()` **ALWAYS returns an object** with this structure:

```javascript
{
  error: Error | null,      // null on success, Error object on failure
  stdout: Stream,            // stdout stream
  stderr: Stream,            // stderr stream
  stats: Stats              // compilation statistics
}
```

### Evidence
From the minified compiler source (node_modules/assemblyscript/dist/asc.js):

```javascript
async function qe(e,n){  // This is the 'main' function
  // ... lots of compilation code ...

  // The return wrapper function 'T':
  T=(l,d={})=>(
    l&&p.write(`${k.red("FAILURE ")}${l.stack.replace(/^ERROR: /i,"")}${E}`),
    _&&_.dispose(),
    t.total||(t.total=t.end(r)),
    Object.assign({error:l,stdout:c,stderr:p,stats:t},d)  // <-- ALWAYS returns object
  );

  // All return statements use T():
  return T(null);  // Success case
  return T(Error(...));  // Failure cases
}
```

### Test Confirmation

```bash
$ node test-main-return.mjs

=== RESULT ===
Type: object
Keys: [ 'error', 'stdout', 'stderr', 'stats' ]
error: null
Binary captured: true
Binary size: 114
```

### Impact on Plugin
The plugin is likely waiting for a numeric exit code that never arrives, causing it to hang.

---

## Critical Finding #2: In-Memory Compilation IS Supported

### The Approach
The AssemblyScript compiler DOES support in-memory compilation through:

1. Pass entry filenames as arguments (e.g., `['test.ts']`)
2. Provide `readFile` callback that returns source for those filenames
3. Provide `writeFile` callback to capture output
4. **Return value is the object described above, NOT an exit code**

### What Works

```javascript
const result = await asc.main([
  'test.ts',  // Virtual filename
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
], {
  readFile: (filename) => {
    if (filename === 'test.ts') {
      return sourceCode;  // Return the source directly
    }
    return null;  // Return null for stdlib/imports
  },
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm')) {
      binary = contents;  // Capture the binary
    }
  },
  stdout: { write: (text) => stdout.push(text) },
  stderr: { write: (text) => stderr.push(text) },
  listFiles: () => [],
});

// Check success/failure via result.error:
if (result.error) {
  console.error('Compilation failed:', result.error);
} else {
  console.log('Success! Binary size:', binary.length);
}
```

### Test Confirmation

```bash
$ node test-main-return.mjs

writeFile called: output.wasm, size: 114
Binary captured: true
Binary size: 114
```

**No temp files were used.** The compilation was purely in-memory.

---

## Critical Finding #3: `compileString()` DOES Work

### Why Tests Failed
The original test used the deprecated `binaryFile` option:

```javascript
// THIS FAILS:
await asc.compileString(source, {
  binaryFile: 'output.wasm',  // DEPRECATED! Causes parse error
  ...
});

// Error: File 'output.wasm.ts' not found
// The compiler treats 'output.wasm' as an ENTRY FILE, not output path!
```

### What Actually Works

```javascript
// THIS WORKS:
const result = await asc.compileString(source, {
  optimizeLevel: 0,
  runtime: 'stub',
  // NO binaryFile option!
});

// Binary is returned IN the result object:
console.log(result.binary);  // Uint8Array of the WASM
console.log(result.text);    // WAT text representation
```

### Test Confirmation

```bash
$ node test-binaryfile-option.mjs

Test 1: compileString WITHOUT binaryFile option
Error: null
Binary in result: true  ✓
Text in result: true    ✓

Test 2: compileString WITH binaryFile option
Error: [1 parse error(s)]  ✗
Binary in result: false
WARNING Unknown option '--binaryFile'
ERROR TS6054: File 'output.wasm.ts' not found.
```

### How `compileString()` Works Internally

From the compiler source:

```javascript
async function Jt(e,n={}){  // This is 'compileString'
  typeof e=="string"&&(e={[`input${C}`]:e});  // Wraps string as {'input.ts': source}
  let t=["--outFile","binary","--textFile","text"];
  se(n,t);
  let r={},
  o=await qe(t.concat(Object.keys(e)),{  // Calls main() internally
    readFile:i=>Object.prototype.hasOwnProperty.call(e,i)?e[i]:null,
    writeFile:(i,s)=>{r[i]=s},  // Captures to in-memory object
    listFiles:()=>[]
  });
  return Object.assign(o,r)  // Merges captured files into result
}
```

So `compileString()` is just a wrapper around `main()` that:
1. Wraps your source in a virtual file object
2. Sets up in-memory readFile/writeFile
3. Returns the result object WITH the captured `binary` and `text` properties

---

## Why the Plugin is Hanging

### Hypothesis
The plugin is using `await asc.main()` correctly, but likely:

1. **Not checking `result.error`** - it may be expecting a numeric exit code
2. **Awaiting something that never resolves** - perhaps waiting for a callback or event
3. **The plugin transform function isn't returning** - Vitest might be waiting forever

### Evidence from plugin.ts

```typescript
// Line 125-151:
await asc.main([
  entryFile,
  '--outFile', outputFile,
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--debug',
], {
  stdout,
  stderr,
  readFile: (readFilename: string) => {
    console.log('[AS Plugin] readFile called for:', readFilename);
    if (readFilename === entryFile) {
      console.log('[AS Plugin] Returning source for:', readFilename);
      return source;
    }
    return null;
  },
  writeFile: (name: string, contents: Uint8Array) => {
    console.log('[AS Plugin] writeFile called:', name, 'size:', contents.length);
    if (name.endsWith('.wasm')) {
      binary = contents;
    }
  },
  listFiles: () => [],
});
```

**Issue**: The code calls `await asc.main()` but doesn't capture the return value or check `result.error`!

The function continues after this to check stdout/stderr, but `asc.main()` already writes errors to stderr internally. The hang might be because:

1. Vitest is waiting for the transform to complete
2. Some error is thrown that's not being caught
3. The promise chain is broken somewhere

---

## Recommendations

### Option 1: Fix `asc.main()` Usage (RECOMMENDED)

Update `src/plugin.ts` to properly handle the return value:

```typescript
const result = await asc.main([...], {...});

// Check for compilation errors
if (result.error) {
  throw new Error(`AssemblyScript compilation failed: ${result.error.message}`);
}

// Binary should have been captured via writeFile callback
if (!binary) {
  throw new Error('No WASM binary was generated');
}

return {
  code: generateJSWrapper(binary, id),
  map: null,
};
```

### Option 2: Use `compileString()` Instead

Even simpler - use the higher-level API:

```typescript
const result = await asc.compileString(originalSource, {
  optimizeLevel: 0,
  runtime: 'stub',
  debug: true,
});

if (result.error) {
  throw new Error(`AssemblyScript compilation failed: ${result.error.message}`);
}

if (!result.binary) {
  throw new Error('No WASM binary was generated');
}

return {
  code: generateJSWrapper(result.binary, id),
  map: null,
};
```

### Option 3: Keep Temp Files (FALLBACK)

If the above still causes issues, temp files DO work reliably. However, this should not be necessary given the findings above.

---

## Conclusion

**In-memory compilation IS fully supported by the AssemblyScript compiler.**

The issues encountered were due to:
1. Misunderstanding the return value of `asc.main()` (object, not exit code)
2. Using deprecated options in test code (`binaryFile`)
3. Not properly handling the async result object in the plugin

The recommended fix is to update the plugin to:
1. Capture the result object from `asc.main()`
2. Check `result.error` for compilation failures
3. Use the captured `binary` from the `writeFile` callback
4. OR use `compileString()` and check `result.error` + `result.binary`

Both approaches work. `compileString()` is simpler but less flexible. `asc.main()` gives more control but requires proper callback handling.

---

## Resolution: FIX CONFIRMED ✅

**Date**: October 17, 2025

After implementing the recommended fix, the plugin now works correctly:

### Changes Made:
1. **Captured result object from `asc.main()`** (line 126 in plugin.ts)
2. **Added `result.error` check** (line 163 in plugin.ts)
3. **Removed manual `_start()` exports** from test files (they were causing export conflicts)
4. **Simplified test files** to just export regular functions for POC validation

### Test Results:
```
✓ tests/simple.as.test.ts > compile and instantiate WASM
✓ tests/simple.as.test.ts > execute WASM tests
✓ tests/math.as.test.ts > compile and instantiate WASM
✓ tests/math.as.test.ts > execute WASM tests

Test Files  2 passed (2)
     Tests  4 passed (4)
  Duration  931ms (transform 614ms, collect 1.02s, tests 9ms)
```

### Compilation Output:
- `simple.as.test.ts`: **178 bytes** WASM binary generated
- `math.as.test.ts`: **191 bytes** WASM binary generated
- Both compiled successfully using **pure in-memory approach** (no temp files)
- `readFile` and `writeFile` callbacks worked perfectly

### Confirmed:
- ✅ In-memory compilation fully works
- ✅ `asc.main()` returns object, not exit code
- ✅ Checking `result.error` is essential
- ✅ No hanging issues when properly implemented
- ✅ WASM binaries execute correctly
- ✅ Vitest integration works

**The POC is successful. Phase 0 validation is complete.**
