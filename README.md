# vitest-pool-assemblyscript

AssemblyScript unit testing for your Vitest workflow: Simple, fast, familiar, AS-native.

- [Motivation](#motivation)
- [Features](#features)
- [Architecture](#architecture)
- [Project Status & Expectations](#project-status--expectations)
- [Installation Guide (Development Preview)](#installation-guide-development-preview)

**Note: 🚧 This project is currently *Pre-Release, Pre-v1, Under Active Development* 🚧**
- See [Project Status & Expectations](#project-status--expectations) for what's working now, and to see what's planned!

---

## Motivation

If you use [Vitest](https://vitest.dev) for JavaScript/TypeScript testing and want to adopt [AssemblyScript](https://www.assemblyscript.org/) as your compile-to-WASM solution for performance-critical code, you have a few choices:

- **This Custom Pool:**
  - `vitest` for JS & AS tests; Jest-style matchers; Unified coverage reporting; Crash isolation; Detailed errors and diffs; Adopt incrementally
- **Standalone AS test tools:**
  - Separate workflows and reports; Inconsistent coverage formats; Limited test parallelism
- **Generic WASM test patterns:**
  - Boilerplate (instantiation, cleanup); Maintenance burden (internal assertions); No test discovery; Manual error source mapping; Limited/no coverage reporting

---

## Features

### 1. Vitest Integration
- Use familiar `vitest` commands, CLI spec and test filtering, watch mode
- Works with Vitest UI, reporters, and coverage tools
- Project (workspace) config allows coexisting AssemblyScript pools and JavaScript pools
- Hybrid Coverage Provider unifies JS/AS test reports from multiple pools (delegating to v8 for JS coverage)

### 2. Per-Test WASM Isolation
- Each AssemblyScript test file is compiled to a WASM binary once
- Each test case runs in a fresh WASM instance, reusing the compiled binary
- One crashing test doesn't kill the rest within the same suite

### 3. Familiar Developer Experience
- Familiar suite and test definition using `describe()` and `test()` directly in AssemblyScript
- Familiar inline test/suite option configuration for common options: `timeout`, `retry`, `skip`, `only`, `fails`
- Familiar assertion matching API based on vitest/jest `expect()` API
- Source-mapped WASM errors with accurate stack traces
- No boilerplate patterns for: `run()`, `endTest()`, `fs.readFile`, `WebAssembly.Instance`, etc

### 4. Performance & Customization
- Lightweight coverage instrumentation
- Remove `@inline` decorators to ensure coverage for normally inlined code
- Parallel execution thread pool
- Enforced hard timeouts for long-running synchronous WASM
- In-memory binaries and source maps for minimal file I/O
- Configurable AssemblyScript compiler options
- Configurable test memory size

### Why This Over [Alternative]?

There are other standalone testing frameworks for AssemblyScript testing, including:
- [assemblyscript-unittest-framework](https://github.com/wasm-ecosystem/assemblyscript-unittest-framework): A full-featured AS test framework
  - Many thanks owed to this project for inspriring parts of our discovery and instrumentation approach
- [as-test](https://github.com/JairusSW/as-test): A minimal and fast AS test framework and runner
- [Built with AssemblyScript - Testing & Benchmarking](https://www.assemblyscript.org/built-with-assemblyscript.html#testing-benchmarking) may track more

---

## Architecture

**⚠️ This section needs updating to reflect recent changes**

Vitest 4.x: Uses [`PoolWorker` API](https://vitest.dev/guide/advanced/pool.html)

Vitest 3.x: Uses [`ProcessPool` API](https://v3.vitest.dev/advanced/pool.html) for alternative runtime execution
- **[Pool Architecture](docs/pool-architecture.md)** - Internal pool architecture and vitest integration points
- **[Coverage Architecture](docs/coverage-architecture.md)** - Coverage instrumentation, collection, and report generation architecture

---

## Project Status & Expectations

**This is a pre-v1 project** being developed in the open by an interested individual. Most core functionality is working, with a long list of planned features and polish to be added as time allows.

*(Note: Not yet published to npm - currently development only)*

### Current State (Pre-v1)

**✅ What Works Now:**
- Dual vitest 3.x / 4.x support
- Test discovery supporting tests and suites with arbitrary nesting and merged options
- WASM execution with function table-based invocation
- Per-test WASM instance isolation
- Test timeout via thread termination, with intelligent resume
- Source-mapped error stacks (accurate file:line:column)
- Highlighted diffs for assertion failures and code frames
- Hybrid Coverage Provider for unified reporting between JS/AS in mixed projects
- Function-level coverage reporting
- Initial set of `expect()` matchers:
  - `toBe`
  - `toBeCloseTo`
  - `toBeTruthy`
  - `toBeFalsey`
  - `toBeNull`
  - `toBeNullable`
  - `toBeNaN`
  - `toEqual`
  - `toHaveLength`
  - `toThrowError`

**⚠️ Known Limitations - Coming Soon:**
- **Function-level coverage only**: No statement, branch, or line coverage yet
- **No lifecycle hooks**: No setup/teardown hooks yet
- **Watch mode specs only**: Re-runs tests when they change themselves, but not yet based on changed related source files
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
- Allow delegating JS/TS to istanbul coverage provider

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

6. **Configure Vitest** in your project's `vitest.config.ts`:
- The `test` project configuration helper(s) needed depend on which version of vitest you're using.
- The `coverage` configuration is the same across versions (shown on the first example below).

**vitest 4.x.x Multiple-Project Config:**
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          name: {
            label: 'assemblyscript-tests',
            color: 'yellow'
          },
          include: ['test/assembly/**/*.as.{test,spec}.ts'],

          // maxWorkers: 8,   // concurrent file execution threads (default: available parallelism)

          // tell vitest to use this custom pool for files in `include`
          pool: createAssemblyScriptPool({
            stripInline: true,          // true to remove @inline decorators for coverage (default: true)
            testMemoryPagesInitial: 2,  // initial WASM memory size in pages (default: 1)
            testMemoryPagesMax: 4,      // maximum WASM memory size in pages (default: undefined)
            extraCompilerFlags: ['--runtime', 'incremental']  // additional asc flags to customize AS compilation
          }),
        }
      }),

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
    enabled: true,
    reportsDirectory: './coverage',
    reporter: ['text', 'lcov', 'html'],
    include: ['src/**/*.ts'],                         // example, include JS/TS sources
    assemblyScriptInclude: ['assembly/**/*.ts'],      // example, include AS sources
    assemblyScriptExclude: ['assembly/helpers/*.ts'], // example, exclude AS sources
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

          pool: 'vitest-pool-assemblyscript',
          poolOptions: {
            assemblyScript: {
              // same available options as v4 createAssemblyScriptPool, PLUS...
              // number of concurrent test file threads to execute in v3 only (v4 uses maxWorkers) 
              // (default: availableParallelism - 1)
              // maxThreadsV3: 8
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
    // same as multi-project AS config here
  },
});
```

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
