# vitest-pool-assemblyscript

AssemblyScript unit testing for your Vitest workflow: Simple, fast, familiar, AS-native.

This is a [Vitest](https://vitest.dev) ["custom pool"](https://vitest.dev/guide/advanced/pool.html) which knows how to compile AssemblyScript to WASM, harness WASM to run tests, and report those results to vitest. It co-exists with existing JavaScript/TypeScript tests, and is designed for incremental adoption.

- [Quickstart](#quickstart)
- [Features](#features)
- [Configuration](#configuration)
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

**vitest 4.x.x Multiple-Project Config:**
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
          bail: 2,           // stop execution after this many failures
          retry: 0,          // number of retries to attempt after initial failure
          testTimeout: 500,  // ms to wait before terminating test
          // maxWorkers: 8,  // concurrent file execution threads (default: available parallelism)

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

**vitest 4.x.x Single-Project Config:**
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

**vitest 3.2.x Multiple-Project Config:**
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/config';

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

**vitest 3.2.x Single-Project Config:**
```typescript
import { defineAssemblyScriptConfig } from 'vitest-pool-assemblyscript/config';

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

**WasmImportsFactory:**
To provide your own WebAssembly imports, configure `wasmImportsFactory` to point to a module which exports a factory function to create your imports:
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

You may provide imports for any environment name you wish. Here is an example imports factory which uses the "env" environment:
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

Example AssemblyScript source code which uses this imported function:
```typescript
@external("env", "parseIntStringFunction")
declare function parseIntStringFunction(input: string): i32;

export function runParseIntStringFunction(input: string): i32 {
  return parseIntStringFunction(input);
}
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

> ⚠️ Warning: Does not yet support user-defined object deep equality checking
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
expect(0).toBeFalsey();
expect("hello").toBeTruthy();
expect("").toBeFalsey();
```

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

>⚠️ Important: You must provide a void callback to expect() when using `toThrowError()`

>ℹ️ Note: `toThrowError()` does not accept inversion using `expect().not.toThrowError()`
```typescript
expect(() => { throw new Error("boom"); }).toThrowError();
expect(() => { throw new Error("boom"); }).toThrowError("boom");
```

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

Follow the [Configuration](#configuration) section.

7. **Write your tests**
```typescript
import { test, describe, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { fibonacciRecursive } from "assembly/math.ts";

test("addition works", () => {
  expect(1 + 1).toBe(2);
  expect(0.1 + 0.2).toBeCloseTo(0.3);
});

test('string concatenation', () => {
  const greeting: string = "Hello" + " " + "World";
  expect(greeting).toBe("Hello World");
});

describe("potential long running tests", TestOptions.timeout(500), () => {
  test('fibonacci 35', TestOptions.retry(2), () => {
    expect(fibonacciRecursive(35)).toBe(9227465);
  });

  // TestOptions can go after the test callback also
  test("fibonacci 38", () => {
    expect(fibonacciRecursive(38)).toBe(39088169);
  }, TestOptions.timeout(200).retry(0));
});

describe.skip("a skipped suite", () => {
  // all tests in suite are skipped
});
```

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
