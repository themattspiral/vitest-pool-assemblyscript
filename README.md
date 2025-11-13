# vitest-pool-assemblyscript

AssemblyScript unit testing for your Vitest workflow: Simple, fast, familiar, AS-native.

🚧 This project is currently *Pre-Release, Pre-v1, Under Active Development* 🚧 - See [Project Status & Expectations](#project-status--expectations) for what's working now, and to see what's planned!

- [Motivation](#motivation)
- [What Will Make This Different](#what-will-make-this-different)
- [How It Works](#how-it-works)
- [Project Status & Expectations](#project-status--expectations)
- [Installation Guide (Development Preview)](#installation-guide-development-preview)

---

## Motivation

If you use [Vitest](https://vitest.dev) for JavaScript/TypeScript testing and want to adopt [AssemblyScript](https://www.assemblyscript.org/) as your compile-to-WASM solution for performance-critical code, you face a choice:

- **Use generic WASM testing patterns:** Instantiation & assertion boilerplate, no test discovery, error source mapping challenges, limited or no coverage collection
- **Use standalone AS testing tools:** Separate test workflows and reports, different coverage formats, limited test parallelism
- **Use this pool:** Keep using `vitest`, add native AssemblyScript tests, use familiar matchers, get unified test runs/reporting/coverage + more

By giving Vitest support for on-demand AssemblyScript-to-WASM compilation and test execution, this custom pool aims to bridge the gap between AssemblyScript and the modern JavaScript testing ecosystem. It's designed to work for incremental adoption: Add AS modules to your existing codebase without changing your testing infrastructure.

---

## What Will Make This Different

### 1. Vitest Ecosystem Integration
- Use the same `vitest` commands, CLI filters, and watch mode you're used to
- Works with Vitest UI, reporters, and coverage tools
- Sibling project config coexists with JavaScript test pools
- Hybrid coverage provider allows unified JS/AS test reports from all pools (vitest's global `coverage` config isn't a blocker)

### 2. Per-Test WASM Isolation
- Each individual test case runs in a fresh WASM instance
- One crashing test doesn't kill the rest within the same suite

### 3. Familiar Developer Experience
- Familiar assertion matching API based on vitest/Jest (future. Dev preview implements simple `test()` and `assert()` API)
- Less Boilerplate: Patterns like `run()`, `endTest()`, `fs.readFile`, `WebAssembly.Instance`, etc are not needed
- Source-mapped error messages with accurate file:line:column
- Lightweight coverage instrumentation

### 4. Additional Features
- Configurable AssemblyScript compiler options
- Optional user-provided `WebAssembly.Memory`
- Remove `@inline` decorators to ensure coverage for normally inlined code
- Parallel execution thread pool with per-test parallelism (similar to vitest's `sequence.concurrent` option)
- In-memory binaries and source maps for minimal file I/O

### Why This Over [Alternative]?

This project was started primarily to integrate the testing experience between AssemblyScript and JavaScript/TypeScript. We hope the features above will differentiate it from alternatives with functionality that JS developers have come to expect from test tools.

There are other solid, actively-maintained, standalone testing frameworks for AssemblyScript, including [assemblyscript-unittest-framework](https://github.com/wasm-ecosystem/assemblyscript-unittest-framework) and [as-test](https://github.com/JairusSW/as-test) - the former in particular has provided inspriration for parts of this project's test discovery and coverage instrumentation approach.

---

## How It Works

Built on the Vitest 3.x [`ProcessPool` API](https://v3.vitest.dev/advanced/pool.html) for alternative runtime execution (4.x support will be right beind!)

### Architecture

To be documented here when it stabilizes.

---

## Project Status & Expectations

**This is a pre-v1 project** being developed as a hobby-project in the open. Core infrastructure works, but significant work remains before a v1 release.

*(Note: Not yet published to npm - currently development only)*

### Current State (Pre-v1)

**What Works Now:**
- ✅ Vitest custom pool interface integration with parallel execution (tinypool)
- ✅ Per-test WASM instance isolation (crash tolerance)
- ✅ Test discovery and execution with function table-based invocation
- ✅ Basic `test()` and `assert()` API
- ✅ Binary caching between collection/execution phases for watch mode
- ✅ Source-mapped error messages (accurate file:line:column)
- ✅ Function-level coverage
- ✅ Manual LCOV output
- ✅ Failsafe re-run mode (temporary workaround - see below)

**Known Limitations:**
- ⚠️ **Function-level coverage only**: No statement, branch, or line coverage yet
- ⚠️ **No Istanbul integration**: Coverage not yet merged with JS coverage in mixed projects
- ⚠️ **Basic assertions only**: No describe blocks, setup/teardown hooks, or rich matchers yet
- ⚠️ **Failing tests run twice**: Current post-processing instrumentation current breaks source maps, requiring "failsafe mode" (first run collects coverage, failed tests re-run on clean binary for accurate errors)
- ⚠️ **vitest config limited**: Many vitest config options are not yet respected (`testTimeout`, `retry`, `bail`)
- ⚠️ **vitest 3.x**: Building against 3.x API but 4.x will come very soon

### v1 Release Roadmap (Current Focus)

**Release Goals**: Native addon integration + hybrid coverage provider + eliminate failsafe mode + vitest 4.x

- **afterCompile hook instrumentation**: Source maps accurate even with instrumentation, no failsafe re-run
- **Native addon (C++) for debug extraction using Binaryen**: Foundation for future block-level coverage
- **Honor key vitest configs**: e.g. `testTimeout`, `retry`, `bail`
- **Hybrid Coverage Provider**: Hybrid JS + AS coverage collection across pools for unified reports
- **Function level coverage**
- **Internal tests**

### Near Future Roadmap

**Epic**: Enhanced block-level coverage with native instrumentation
- Block-level statement coverage (line-by-line granularity)
- Branch coverage using CFG analysis
- All 4 coverage types (function, statement, branch, line)
- Native addon handles both instrumentation + extraction

**Epic**: Testing DX
- Nested `describe()` blocks
- Lifecycle hooks (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`)
- Expanded compiler options support
- Watch mode optimization

**Epic**: Rich matcher API
- POC matchers in AssemblyScript (`toBe`, `toEqual`, `toBeCloseTo`, etc.)
- Evaluate DX, maintainability, and value
- Ship what's feasible

**Out of Scope (Currently):**
- ✖️ Compiler integration with other compile-to-WASM languages
- ✖️ Generic testing of all precompiled WASM binaries

---

## Installation Guide (Development Preview)

**⚠️ Important:** This project is under active development. Features and APIs may change without notice. No guarantees are made about stability or functionality.

**Feedback Welcome:** If you try this out, please open an issue on GitHub with your experience, bugs, or suggestions!

### Prerequisites
- Node.js 20.0.0+ (required due to our multi-memory coverage approach)
- Vitest 3.2.4+ (v3.x only for now - v4 support planned)
- AssemblyScript 0.28+

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/themattspiral/vitest-pool-assemblyscript.git
cd vitest-pool-assemblyscript
```

2. **Install deps and build**
```bash
npm install
npm run build
```

2. **Link the pool to your project:**
```bash
# In vitest-pool-assemblyscript:
npm link

# In your project directory:
npm link vitest-pool-assemblyscript
```

3. **Configure Vitest** in your project's `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Standard Vitest configuration
    include: ['tests/assembly/**/*.as.test.ts'],
    exclude: ['**/node_modules/**'],

    // Use the AssemblyScript pool
    pool: 'vitest-pool-assemblyscript',

    // Pool-specific options
    poolOptions: {
      assemblyScript: {
        // Strip @inline decorators for complete coverage visibility
        stripInline: true,

        // Enable debug logging (shows compilation, execution flow)
        debug: false
      }
    }
  }
});
```

If you need to run tests in multiple pools (e.g. JS in one, AssemblyScript in the other), use multiple projects:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Coverage config MUST be at root level (Vitest limitation - applies to all projects)
    // TBD - COVERAGE WILL NOT WORK USING THIS YET - STAY TUNED!
    coverage: {
      enabled: true,
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts', 'assembly/**/*.ts'], // Include both JS and AS sources
    },

    projects: [
      {
        extends: true, // extend the standard vitest config
        test: {
          name: {
            label: 'javascript-typescript',
            color: 'blue'
          },
          include: ['tests/js/*.{test,spec}.{ts,js}'],
          // remaining JS config...
        }
      },
      {
        test: {
          name: {
            label: 'assemblyscript',
            color: 'yellow'
          },
          include: ['tests/assembly/**/*.as.{test,spec}.ts'],
          environment: 'node',

          pool: 'vitest-pool-assemblyscript',
          poolOptions: {
            assemblyScript: {
              // debug, maxThreads, stripInline, etc
            }
          }
        }
      }
    ]
  }
})
```

4. **Write a test** in `tests/assembly/example.as.test.ts`:
```typescript
import { test, assert } from 'vitest-pool-assemblyscript/assembly';

test('addition works', () => {
  const result: i32 = 1 + 1;
  assert(result == 2, 'one plus one should equal two');
});

test('string concatenation', () => {
  const greeting: string = 'Hello' + ' ' + 'World';
  assert(greeting == 'Hello World', 'strings should concatenate');
});
```

5. **Run your tests:**
```bash
# Run all tests once
npx vitest run

# Run specific test file
npx vitest run example.as.test.ts
```

---

## License

MIT