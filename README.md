# vitest-pool-assemblyscript

AssemblyScript unit testing for your Vitest workflow: Simple, fast, familiar, AS-native.

- [Motivation](#motivation)
- [What Makes This Different](#what-makes-this-different)
- [Architecture](#architecture)
- [Project Status & Expectations](#project-status--expectations)
- [Installation Guide (Development Preview)](#installation-guide-development-preview)

**Note: 🚧 This project is currently *Pre-Release, Pre-v1, Under Active Development* 🚧**
- See [Project Status & Expectations](#project-status--expectations) for what's working now, and to see what's planned!

---

## Motivation

If you use [Vitest](https://vitest.dev) for JavaScript/TypeScript testing and want to adopt [AssemblyScript](https://www.assemblyscript.org/) as your compile-to-WASM solution for performance-critical code, you face a choice:

- **Generic WASM test patterns:**
  - Boilerplate (instantiation, cleanup), Maintenance burden (assertions) , No test discovery, Manual error source mapping, Limited/no coverage
- **Standalone AS test tools:**
  - Separate workflows and reports, Different coverage formats, Limited test parallelism
- **Custom Pool:**
  - Keep using `vitest`, Familiar matchers, Unified test runs/reporting, Unified coverage + more

### The Pool Approach
- This custom pool gives Vitest support for on-demand AssemblyScript-to-WASM compilation and test execution
- It aims to bridge the gap between AssemblyScript and the modern JavaScript testing ecosystem
- It's designed to work for incremental adoption: Add AS modules to your existing codebase without changing your testing infrastructure

---

## What Makes This Different

### 1. Vitest Ecosystem Integration
- Use familiar `vitest` commands, CLI spec and test filtering, watch mode
- Works with Vitest UI, reporters, and coverage tools
- Project (workspace) config allows coexisting AssemblyScript pools and JavaScript pools
- Hybrid Coverage Provider allows unified JS/AS test reports from multiple pools (vitest's global `coverage` config isn't a blocker)

### 2. Per-Test WASM Isolation
- Each AssemblyScript test file is compiled to a WASM binary once
- Each individual test case runs in a fresh WASM instance, reusing the compiled binary
- One crashing test doesn't kill the rest within the same suite

### 3. Familiar Developer Experience
- Familiar suite and test definition using `describe()` and `test()` directly in AssemblyScript
- Familiar inline test/suite option confirguration for common options: `timeout`, `retry`, `skip`, `only`, `fails`
- Familiar assertion matching API based on vitest/Jest (future! dev preview implements simple `assert()` API currently)
- Less Boilerplate: Patterns like `run()`, `endTest()`, `fs.readFile`, `WebAssembly.Instance`, etc are not needed
- Source-mapped WASM errors with accurate stack traces

### 4. Performance & Customization
- Lightweight coverage instrumentation
- Remove `@inline` decorators to ensure coverage for normally inlined code (handles `@inline`)
- Parallel execution thread pool
- Enforced timeout limits for long-running WASM code, even if blocking
- In-memory binaries and source maps for minimal file I/O
- Configurable AssemblyScript compiler options
- Optional user-provided `WebAssembly.Memory`

### Why This Over [Alternative]?

By providing functionality that JS developers have come to expect, this project brings a more mature JS-like developer experience to AssemblyScript testing. We believe the features above make our vitest custom pool a stand-out choice.

There are other standalone testing frameworks for AssemblyScript testing, including:
- [assemblyscript-unittest-framework](https://github.com/wasm-ecosystem/assemblyscript-unittest-framework): A full-featured AS test framework
  - Many thanks owed to this project for inspriring parts of our discovery and instrumentation approach
- [as-test](https://github.com/JairusSW/as-test): A minimal and fast AS test framework and runner
- [Built with AssemblyScript - Testing & Benchmarking](https://www.assemblyscript.org/built-with-assemblyscript.html#testing-benchmarking) may track more

---

## Architecture

**⚠️ This section needs updating to reflect recent changes**

Vitest 4.0.0: Uses [`PoolWorker` API](https://vitest.dev/guide/advanced/pool.html)

Vitest 3.2.0: Uses [`ProcessPool` API](https://v3.vitest.dev/advanced/pool.html) for alternative runtime execution
- **[Pool Architecture](docs/pool-architecture.md)** - Internal pool architecture and vitest integration points
- **[Coverage Architecture](docs/coverage-architecture.md)** - Coverage instrumentation, collection, and report generation architecture

---

## Project Status & Expectations

**This is a pre-v1 project** being developed as a hobby-project in the open. Core functionality is working, with a long list of planned features and polish to be added as time allows.

*(Note: Not yet published to npm - currently development only)*

### Current State (Pre-v1)

**✅ What Works Now:**
- Vitest custom PoolWorker and Worker thread
- Test discovery supporting tests and suites with arbitrary nesting and merged options
- WASM execution with function table-based invocation
- Per-test WASM instance isolation
- Test timeout via thread termination, with intelligent resume
- Basic `assert()` for boolean and equality assertions
- Source-mapped error stacks (accurate file:line:column)
- Highlighted diffs for assertion failures and code frames
- Hybrid Coverage Provider for unified reporting between JS/AS in mixed projects
- Function-level coverage reporting

**⚠️ Known Limitations:**
- **Function-level coverage only**: No statement, branch, or line coverage yet
- **Basic assertions only**: No setup/teardown hooks, or rich matchers yet
- **Watch mode**: Doesn't yet re-run tests based on updated source files

### Near Future Roadmap

**Epic**: Enhanced block-level coverage
- Block-level statement coverage (line granularity)
- Branch coverage using CFG analysis
- All 4 coverage types (function, statement, branch, line)

**Epic**: Testing DX
- Lifecycle hooks (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`)
- Expanded compiler options support
- Watch mode optimization

**Epic**: Rich matcher API
- AssemblyScript `expect()` style matchers (`toBe`, `toEqual`, `toBeCloseTo`, etc)
- Evaluate DX, maintainability, and value case by case

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

2. **Install npm deps, then Binaryen C++ dependencies**
```bash
npm install
npm run setup-binaryen
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

**vitest 3.2.x Single-Project Config:**
```typescript
import { defineAssemblyScriptConfig } from 'vitest-pool-assemblyscript/config';

export default defineAssemblyScriptConfig({
  test: {
    include: ['test/assembly/**/*.as.test.ts'],
    exclude: ['**/node_modules/**'],

    pool: 'vitest-pool-assemblyscript',

    poolOptions: {
      assemblyScript: {
        stripInline: true,      // strip @inline decorator for coverage visibility
        maxThreads: undefined,  // max tinypool threads (#CPUs-1 default when undefined)
        debug: false,
      }
    }
  },
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

**vitest 3.2.x Multiple-Project Config:**
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          name: {
            label: 'javascript-typescript-tests',
            color: 'blue'
          },
          include: ['test/js/*.{test,spec}.{ts,js}'],
          // remaining JS/TS config...
        }
      }),
      defineAssemblyScriptProject({
        test: {
          name: {
            label: 'assemblyscript',
            color: 'yellow'
          },
          include: ['test/assembly/**/*.as.{test,spec}.ts'],

          pool: 'vitest-pool-assemblyscript',
          poolOptions: {
            assemblyScript: {
              // debug, maxThreads, stripInline, etc
            }
          }
        }
      })
    ]
  },
  // Coverage config must be at root level (Vitest requirement - applies to all projects)
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


**vitest 4.x.x Multiple-Project Config:**
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { defineConfig } from 'vitest-pool-assemblyscript/config';

// standard vitest defineConfig now
export default defineConfig({
  test: {
    // everything here is the same

    // NEW for v4
    pool: createAssemblyScriptPool({
      debug: false,
      stripInline: true,
      coverageMemoryPagesMax: 2,
    }),
  },
  coverage: {
    // no change
  },
});
```

**vitest 4.x.x Multiple-Project Config:**
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    projects: [
      defineProject({
          // no change
        }
      }),

      // standard vitest defineProject now
      defineProject({
        test: {
          // everything here is the same

          // NEW for v4
          pool: createAssemblyScriptPool({
            debug: false,
            stripInline: true,
            coverageMemoryPagesMax: 2,
          }),
        }
      })
    ]
  },
  coverage: {
    // no change
  },
});
```

7. **Write your tests**
```typescript
import { test, describe, assertEquals, TestOptions } from 'vitest-pool-assemblyscript/assembly';

import { fibonacciRecursive } from 'assembly/math.ts';

test('addition works', () => {
  const result: i32 = 1 + 1;
  assertEquals(result, 2, 'one plus one should equal two');
});

test('string concatenation', () => {
  const greeting: string = 'Hello' + ' ' + 'World';
  assertEquals(greeting, 'Hello World');
});

describe("potential long running tests", TestOptions.timeout(500), () => {
  test('fibonacci 35', TestOptions.retry(2), () => {
    assert(fibonacciRecursive(35) == 9227465);
  });

  test("fibonacci 38", TestOptions.timeout(200).retry(0) () => {
    assertEqual(fibonacciRecursive(38), 39088169);
  });
});

describe.skip("a skipped suite", () => {
  // all tests are skipped
});

describe("another skipped suite", TestOptions.skip(), () => {
  // all tests are skipped
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
