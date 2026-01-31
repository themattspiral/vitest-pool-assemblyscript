# vitest-pool-assemblyscript

AssemblyScript unit testing for your Vitest workflow: Simple, fast, familiar, AS-native.

This is a [Vitest](https://vitest.dev) ["custom pool"](https://vitest.dev/guide/advanced/pool.html) which knows how to compile AssemblyScript to WASM, harness WASM to run tests, and report those results to vitest. It co-exists with existing JavaScript/TypeScript tests, and is designed for incremental adoption.

- [Quickstart](#quickstart)
- [Features](#features)
- [Configuration](#configuration)
- [Writing Tests](#writing-tests)
- [Matcher API](#matcher-api)
- [Project Status & Expectations](#project-status--expectations)
- [Installation Guide (Development Preview)](#installation-guide-development-preview)

**Note: 🚧 This project is currently *Pre-Release, Pre-v1, Under Active Development* 🚧**
- See [Project Status & Expectations](#project-status--expectations) for what's working now, and to see what's planned!

---

## Quickstart

Coming Soon!

---

## Features

### Vitest Integration
- Use familiar `vitest` commands, CLI spec and test filtering, watch mode
- Works with Vitest UI, reporters, and coverage tools
- Project (workspace) config allows coexisting AssemblyScript pools and JavaScript pools
- Hybrid Coverage Provider unifies test reports from multiple pools (delegating to v8 for JS/TS coverage)
- Coverage reporting using any vitest reporter (`html`, `lcov`, `json`, etc)
- Dual vitest 3.x / 4.x support

### Per-Test WASM Isolation
- Each AssemblyScript test file is compiled to a WASM binary once
- Each test case runs in a fresh WASM instance (reusing the compiled binary)
- One crashing test doesn't kill the rest within the same suite
- `toThrowError()` matcher can be used to catch and expect specific errors (which trap and abort)

### Familiar Developer Experience
- Suite and test definition using `describe()` and `test()` in AssemblyScript
- Inline test option configuration for common vitest options: `timeout`, `retry`, `skip`, `only`, `fails`
- Assertion matching API based on vitest/jest `expect()` API. See [Matcher API](#matcher-api) for the set of supported matchers and differences from JavaScript 
- Highlighted diffs for assertion and runtime failures, which point to source code
- Source-mapped WASM error stack traces (accurate source `function file:line:column`)
- AssemblyScript console output captured and provided to vitest for display
- No boilerplate patterns for: `run()`, `endTest()`, `fs.readFile`, `WebAssembly.Instance`, etc

### Performance & Customization
- Parallel execution thread pool
- Lightweight coverage instrumentation using separate memory
- In-memory binaries and source maps for minimal file I/O
- Coverage for inlined (`@inline`) code
- Enforced hard timeouts for long-running WASM via thread termination, with intelligent resume
- Configurable AssemblyScript compiler options
- Configurable test memory size
- Configurable WASM imports with access to memory

### Why This Over [Alternative]?

There are other standalone testing frameworks for AssemblyScript testing, including:
- [assemblyscript-unittest-framework](https://github.com/wasm-ecosystem/assemblyscript-unittest-framework): A full-featured AS test framework
  - Many thanks owed to this project for inspiring parts of our discovery and instrumentation approach
- [as-test](https://github.com/JairusSW/as-test): A minimal and fast AssemblyScript test framework and runner
- [Built with AssemblyScript - Testing & Benchmarking](https://www.assemblyscript.org/built-with-assemblyscript.html#testing-benchmarking) may track more

---

## Configuration

In your project's `vitest.config.ts`:
- The `test` project configuration helpers needed depend on which version of vitest you're using.
- The `coverage` configuration is the same across versions (shown in the first example below).

### vitest 4.x.x Multiple-Project Config:
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    projects: [
      // AssemblyScript project
      defineProject({
        test: {
          name: {
            label: 'assemblyscript-tests',
            color: 'yellow'
          },
          include: ['test/assembly/**/*.as.{test,spec}.ts'],
          
          // supported vitest options
          bail: 2,            // stop test run after this many failures
          retry: 0,           // number of retries to attempt after initial failure
          testTimeout: 500,   // ms to wait before terminating test
          // allowOnly: true, // whether or not to respect test.only and describe.only
          // maxWorkers: 8,   // concurrent file execution threads (default: available parallelism)

          // configure vitest to use this custom pool for test files in `include`
          pool: createAssemblyScriptPool({
            stripInline: true,          // true to remove @inline decorators for coverage (default: true)
            testMemoryPagesInitial: 2,  // initial WASM memory size in pages (default: 1)
            testMemoryPagesMax: 4,      // maximum WASM memory size in pages (default: undefined)
            extraCompilerFlags: ['--runtime', 'incremental'],      // additional asc flags to customize AS compilation
            wasmImportsFactory: 'test-helpers/create-imports.js',  // factory function to create your own WASM imports
          }),
        }
      }),

      // JavaScript/TypeScript project
      defineProject({
        test: {
          name: {
            label: 'javascript-typescript-tests',
            color: 'blue'
          },
          include: ['test/js/*.{test,spec}.{ts,js}'],
        }
      }),
    ]
  },

  // Coverage config must be at root level (applies to all projects).
  // The "hybrid" provider delegates JS to v8, and merges AS coverage into the final report
  coverage: {
    provider: 'custom',
    customProviderModule: 'vitest-pool-assemblyscript/coverage',
    assemblyScriptInclude: ['assembly/**/*.ts'],      // example, include AS sources to report on
    assemblyScriptExclude: ['assembly/helpers/*.ts'], // example, exclude AS sources from reporting
    
    // all other v8 coverage options will be passed through to delegated v8 provider
    enabled: true,
    cleanOnRerun: true,
    reportsDirectory: './coverage',
    reporter: ['text', 'lcov', 'html'],
    include: ['src/**/*.ts'],            // example, include JS/TS sources to report on
  },
});
```

### vitest 4.x.x Single-Project Config:
```typescript
import { defineConfig } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    pool: createAssemblyScriptPool({
      // no change to available options (stripInline, testMemoryPagesInitial, etc)
    }),
  },
  coverage: {
    // no change to available options
  }
});
```

### vitest 3.2.x Multiple-Project Config:
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          // JS/TS project config...
        }
      }),
      defineAssemblyScriptProject({
        test: {
          // AS project config... (standard name/label, include, etc)

          pool: 'vitest-pool-assemblyscript/v3',  // in v3, point to the module
          poolOptions: {
            assemblyScript: {
              // same available options as v4 createAssemblyScriptPool are passed here
              
              // Additonal - v3 Only
              // maxThreadsV3: 8    // concurrent test file threads to execute (default: availableParallelism - 1)
            }
          }
        }
      })
    ]
  },
  
});
```

### vitest 3.2.x Single-Project Config:
```typescript
import { defineAssemblyScriptConfig } from 'vitest-pool-assemblyscript/v3/config';

export default defineAssemblyScriptConfig({
  test: {
    pool: 'vitest-pool-assemblyscript/v3',
    poolOptions: {
      assemblyScript: {
        // same available options as v4 createAssemblyScriptPool and v3 multi-project
      }
    }
  },
});
```

### Framework-Provided Imports

**`console`**
The pool provides the full implementation of the [AssemblyScript `console` interface](https://www.assemblyscript.org/stdlib/console.html). This means you can transparently use `console.log("some string")` in your tests, and the output will be fed to vitest and displayed with the test results.

If you prefer to do something else with your test console output, you may provide your own versions of these functions to the "env" module - See the next section for details on how to do this.

**`trace`**
The pool also provides an implementation for `trace`, which passes through to Node `console.trace()` immediately for debugging.

**`abort`**
The pool handles assertion errors, runtime errors, and expected throws by providing an abort handler. This cannot be user-overridden.


### User-Provided Imports with `WasmImportsFactory`
To provide your own WebAssembly imports, configure `wasmImportsFactory` to point to an ES module which exports a factory function to create your imports:
```typescript
  // v4
  // ...
    pool: createAssemblyScriptPool({
      wasmImportsFactory: 'test-helpers/create-imports.js',
    })
  // ...

  // v3
  // ...
  poolOptions: {
    assemblyScript: {
      wasmImportsFactory: 'test-helpers/create-imports.js',
    }
  }
  // ...
```

The type signature for this function looks like this:
```typescript
type WasmImportsFactory = (moduleInfo: WasmImportsFactoryInfo) => WebAssembly.Imports;
```

And the `moduleInfo` argument that it is provided with looks like this:
```typescript
interface WasmImportsFactoryInfo {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  utils: {
    // convenience function for extracting returned strings from WASM memory
    liftString: (stringPtr: number) => string | undefined;
  }
}
```

You may provide imports for any module name you wish. Here is an example factory function which uses the "env" module:
```js
export default function createWasmImports({ memory, module, utils }) {
  return {
    env: {
      parseIntStringFunction: (inputStrPtr) => {
        return parseInt(utils.liftString(inputStrPtr));
      }
    }
  };
}
```

Example AssemblyScript source code which uses this imported function (the "env" module name is specified):
```typescript
@external("env", "parseIntStringFunction")
declare function parseIntStringFunction(input: string): i32;

export function runParseIntStringFunction(input: string): i32 {
  return parseIntStringFunction(input);
}
```

#### Module Names
If you omit the module name in `@external` (e.g. `@external("parseIntStringFunction")`) or omit `@external` entirely, AssemblyScript uses the source file's own name (without the last file extension) as the module name, making it impractical to provide matching imports to every source file independently if you use imported functions across multiple places in your source. It is recommended to always specify a shared module name (such as "env") for this reason.

Conversely, if you need to provide imports targeted to a specific source file, this behavior provides a way to do that as well. For example, if you have a source AS file called `my-file.as.ts` with `declare function myFunc(input: string): i32;` in it and omit the `@external` decorator, then you can import the function *only to this file* with:
```js
export default function createWasmImports({ utils }) {
  return {
    // default source file module name (omits the .ts extension)
    'my-file.as': {
      myFunc: (inputStrPtr) => {
        return parseInt(utils.liftString(inputStrPtr));
      }
    }
  };
}
```

---

## Writing Tests

Import `test`, `describe`, `expect` (and `TestOptions` if needed) from `vitest-pool-assemblyscript/assembly`.

`it` is available as an alias for `test`.

```typescript
import { test, it, describe, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { add } from "../assembly/math.ts";

test("a test", () => {
  expect(1 + 1).toBe(2);
  expect(add(3, 2)).toBe(5);
});

describe("a suite of math operations", () => {
  test("another test", () => {
    expect(3 - 1).toBe(2);
  });

  describe("a nested suite of float operations", () => {
    it("tests something else", () => {
      expect(0.1 + 0.2).toBeCloseTo(0.3);
    });
  });
});
```

### Modifiers: `.skip`, `.only`, `.fails`

```typescript
test.skip("not ready yet", () => { /* ... */ });

test.only("run only this test", () => { /* ... */ });

test.fails("expected to fail, so will actually pass", () => {
  expect(false).toBeTruthy();
});

describe.skip("entire suite skipped", () => { /* ... */ });

describe.only("only this suite runs", () => { /* ... */ });
```

### Inline Test Options

`TestOptions` provides chainable configuration for `timeout`, `retry`, `skip`, `only`, and `fails`. Options can be placed before or after the callback, and suite options are inherited by nested tests and suites.

```typescript
// options before callback
test("with timeout", TestOptions.timeout(500), () => { /* ... */ });

// options after callback
test("with retry", () => { /* ... */ }, TestOptions.retry(3));

// chained options
test("with both", TestOptions.timeout(500).retry(2), () => { /* ... */ });

// suite-level options are inherited by nested tests
describe("slow tests", TestOptions.timeout(1000), () => {
  test("inherits suite timeout", () => { /* ... */ });

  // test-level options override suite options
  test("custom retry", TestOptions.retry(5), () => { /* ... */ });
});

// modifiers and options can be combined
test.fails("expected failure with retry", TestOptions.retry(3), () => {
  expect(false).toBeTruthy();
});
```

---

## Matcher API

This project aims to follow the [vitest/jest `expect()` API](https://vitest.dev/api/expect.html) as closely as possible, with some necessary differences given AssemblyScript's static-typing. 

The following subset of vitest/jest expect matchers are currently supported:

### `.not`
Inverts the matcher that follows. Can be chained.
```typescript
expect(1).not.toBe(2);
expect("hello").not.toBeNull();
```

### `toBe()`
Checks that a value is what you expect. Primitives and strings are compared directly, and references are checked for reference equality only (including objects and arrays). These comparisons are done using `==`, although it is forgiving of numeric type differences.

Don't use `toBe` with floating-point numbers - see `toBeCloseTo()` instead.
```typescript
expect(1 + 1).toBe(2);
expect("hello").toBe("hello");
```

> ⚠️ IMPORTANT: this matcher is currently too permissive with type comparison - it deems some numeric values of different types to be the same when they shouldn't actually be. The `toEqual()` matcher is more appropriate for these permissive sementics. Fix coming soon!

### `toBeCloseTo()`
Checks if a floating point value is close to what you expect. Using exact equality with floating point numbers often doesn't work correctly, because small internal rounding occurs to be able to represent floats in binary. This rounding means intuitive comparisons will often fail.

Comparing strings, integers, or references will fall back to using a `toBe` comparison.

Accepts an additional `precision: i32` argument - Number of decimal places that must match for values to be considered close. Defaults to 2 digits, meaning effectively that values must be within 0.005 of each other.
```typescript
expect(0.1 + 0.2).toBeCloseTo(0.3);
expect(1.005).toBeCloseTo(1.0, 1);
```

### `toEqual()`
Checks that two values have the same value (deep equality). Currently supports checking equality of Arrays, Sets, Maps, and nulls. Values inside arrays are compared using `toEqual()` also, while Maps and Sets use their respective rules for membership.

Primitives, strings, and other object references are compared with `toBe()` rules.

> ⚠️ IMPORTANT: Does not yet support user-defined object deep equality checking. Coming soon!

```typescript
expect([1, 2, 3]).toEqual([1, 2, 3]);
expect(["one", "two", "three"]).toEqual(["one", "two", "three"]);

// objects use reference equality (deep equality not yet supported)
const a: MyObject = new MyObject();
const b: MyObject = new MyObject();
expect([a, b]).toEqual([a, b]);
```

### `toStrictEqual()`
Alias for `toEqual()`. Currently no differences in AssemblyScript.

### `toBeTruthy()` & `toBeFalsey()`
Check that a value is truthy or falsey. Falsey values are `0`, `false`, `""`, and `null`.

```typescript
expect(1).toBeTruthy();
expect("hello").toBeTruthy();
expect("").toBeFalsey();  // <-- Empty String is TRUTHY in AS!
expect(0).toBeFalsey();
expect(NaN).toBeFalsey();
expect(null).toBeFalsey();
```

>⚠️ AS Quirk: Unlike in JavaScript, empty string is truthy in AssemblyScript because it is an object reference, not a primitive. An empty string is still an allocated object with a non-zero address, so it evaluates as truthy!

### `toBeNull()`
Checks that a value is null (`usize(0)` in AssemblyScript).

```typescript
const val: string | null = null;
expect(val).toBeNull();
expect("hello").not.toBeNull();
expect(0).not.toBeNull();
expect(false).not.toBeNull();
```

### `toBeNullable()`
Checks that the type of the value is nullable (can hold `null`). This is a type-level check, not a value check — use `toBeNull()` to check if a value *is* null.

```typescript
const val: string | null = null;
expect(val).toBeNullable();
expect("hello").not.toBeNullable();
```

### `toBeNaN()`
Checks that a floating point value is `NaN`.

```typescript
expect(NaN).toBeNaN();
expect(1.0).not.toBeNaN();
```

### `toHaveLength()`
Checks that an array or array-like value has the expected length.

```typescript
expect([1, 2, 3]).toHaveLength(3);
expect([]).toHaveLength(0);
expect("hello world").toHaveLength(11);
```

### `toThrowError()`
Checks that a function throws an error when called. Optionally checks that the error message matches the provided string. Also available as `toThrow()`.

```typescript
expect(() => { throw new Error("boom"); }).toThrowError();
expect(() => { throw new Error("boom"); }).toThrowError("boom");
```

>⚠️ AS Quirk: You must provide a callback with a non-inferred type to expect() when using `toThrowError()`, e.g. `expect(() => { returnsNumber(); })` (definitely void) or `expect((): i32 => returnsNumber())` (explicit type)

>ℹ️ Note: `toThrowError()` does not accept inversion using `expect().not.toThrowError()`

### Planned Matchers
`toBeDefined`, `toBeUndefined`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`, `toBeLessThan`, `toBeLessThanOrEqual`, `toContain`, `toContainEqual`

### Likely Matchers
`toBeOneOf`, `toBeTypeOf`, `toBeInstanceOf`, `toHaveProperty`, `toMatch`

---

## Project Status & Expectations

**This is a pre-v1 project** being developed in the open by an interested individual. Most core functionality is working, with a long list of planned features and polish to be added as time allows.

*(Note: Not yet published to npm - currently development only)*

### Current State

All features listed in the [Features](#features) section are working and assumed to be bug-free. Please [report a bug](https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new) if you encounter one.

**⚠️ Known Limitations - Coming Soon:**
- **Function-level coverage only**: No statement, branch, or line coverage yet
- **No lifecycle hooks**: No setup/teardown hooks yet
- **Watch mode specs only**: Re-runs test files when they are directly changed, but not yet based on changed source files
- **`toEqual` doesn't reflect**: Doesn't yet support deep inspection of user-defined objects

### Near Future Roadmap

**Epic: Enhanced block-level coverage**
- Block-level statement coverage (line granularity)
- Branch coverage using CFG analysis
- All 4 coverage types (function, statement, branch, line)

**Epic: Testing DX**
- Lifecycle hooks (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`)
- Watch mode optimization
- `toEqual` reflection
- expect.soft
- Allow delegating JS/TS to istanbul coverage provider
- Per-file compilation setting override?

**Epic: Expand expect matcher API**
- Planned: `toBeDefined`, `toBeUndefined`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`, `toBeLessThan`, `toBeLessThanOrEqual`, `toContain`, `toContainEqual`
- Probably: `toBeOneOf`, `toBeTypeOf`, `toBeInstanceOf`, `toHaveProperty`, `toMatch`

**Epic: Spy and Mock**
- TBD

**✖️ Out of Scope (Currently):**
- Compiler integration with other compile-to-WASM languages (Rust, C++)
  - I would LOVE to expand this project to a more generic wasm pool, supporting pluggable compilers and ast parsing for different WASM ecosystems and toolchains
  - Not in scope now because of time and effort. If you want to pay me to work on this [get in touch](https://github.com/themattspiral)!
- Generic JS-harness testing of any precompiled WASM binary

---

## Installation Guide (Development Preview)

**⚠️ Important:** This project is under active development. Features and APIs may change without notice. No guarantees are made about stability or functionality.

**Feedback Welcome:** If you try this out, please open an issue on GitHub with your experience, bugs, or suggestions!

### Prerequisites
- Node.js 20.0.0+ (required due to our multi-memory coverage approach)
- Vitest 3.2.0+ or 4.0.0+
- AssemblyScript 0.28+
- C++ build tools (dev only - distributed package will include prebuilds):
  - GCC 7+ or Clang 5+ (C++17 support required)
  - Python 3.x (required by node-gyp)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/themattspiral/vitest-pool-assemblyscript.git
cd vitest-pool-assemblyscript
```

2. **Install Binaryen C++ dependencies, then npm deps**
```bash
npm run setup-binaryen
npm install
```
The `setup-binaryen` script downloads prebuilt Binaryen libraries and C++ headers to `third_party/binaryen/`. These are used to build the native addon that extracts debug info from WASM binaries.

3. **Build Native Addon**
```bash
npm run build:native
```

4. **Build Pool**
```bash
npm run build
```

5. **Link the pool to your project:**
```bash
# In vitest-pool-assemblyscript:
npm link

# In your project directory:
npm link vitest-pool-assemblyscript
```

6. **Configure Vitest** 

See the [Configuration](#configuration) section.

7. **Write your tests**
See the [Writing Tests](#writing-tests) section.

8. **Run your tests:**
```bash
# Run all tests once
npx vitest run

# Run specific test file
npx vitest run example.as.test.ts

# Run specific test in specific file
npx vitest run example.as.test.ts -t "my test name"
```

---

## License

[MIT](LICENSE)
