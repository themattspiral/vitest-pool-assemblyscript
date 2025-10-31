# vitest-pool-assemblyscript

**AssemblyScript testing for projects using Vitest - Simple, fast, familiar, AS-native, full coverage**

A [Vitest](https://vitest.dev/) custom pool that brings [AssemblyScript](https://www.assemblyscript.org/) testing into your existing Vitest workflow.

Note this pool is currently designed for **Vitest v3** - v4 support is planned for the near future, when v3 MVP is feature-complete!

Features:
- Per-test WASM instance isolation for crash tolerance and memory isolation
- Source-mapped error messages (AssemblyScript function names, line & column numbers)
- Full AssemblyScript coverage tracking
- Familiar testing API (Vitest/Jest inspired)
- Parallel compilation, disovery, and test execution
- Cached, in-memory binaries and source maps
- Vitest integrated test reporting and coverage reporting
- Lives side-by-side with JavaScript/TypeScript tests

---

## Motivation

If your JavaScript/TypeScript project using Vitest today is adopting AssemblyScript for performance-critical code, you face a choice:

- **Use standalone AS testing tools** → New workflows, separate test commands, different coverage formats, different reporting, different CI integration
- **Use generic WASM testing patterns** → Instantiation boilerplate to maintain, no test discovery, potentially cryptic errors, no built-in runner features
- **Use this pool** → Keep using `vitest`, add `.as.test.ts` files, get familiar matchers and reporting, blazing fast tests, resilient & isolated runner by design

This pool aims to bridge the gap between AssemblyScript and the modern JavaScript testing ecosystem. It's designed for easy incremental adoption - add AS modules to your existing codebase without changing your testing infrastructure.

This is for you if:
- ✅ You're using Vitest for JS/TS testing
- ✅ You want to add AssemblyScript for performance-critical modules
- ✅ You want to keep using familiar testing workflows

---

## What Makes This Different

### 1. **Vitest Ecosystem Integration**
- Use the same `vitest` command, config, and watch mode you already have
- Works with Vitest UI, reporters, and coverage tools
- Filter tests with familiar patterns: `vitest run math` or `vitest --coverage`
- No separate test runner to learn or configure

### 2. **WASM Isolation**
- Each test runs in a fresh WASM instance
- One crashing test doesn't kill the rest

### 3. **Familiar Developer Experience**
- Jest/Vitest-like matchers (in progress): `expect(x).toBe(y)`, `toBeCloseTo()`, etc.
- No `run()` or `endTest()` boilerplate required
- AS `console.log` capture for debugging
- Configurable AS compiler options

### 4. **Additional Features**
- Optionally remove `@inline` decorators to gather coverage for normally inlined code
- Configurable AssemblyScript compiler options
- Optional user-provided `WebAssembly.Memory`
- In-memory binaries and source maps
- Parallel pool pipeline

---

## Why This Over [Alternative]?

### vs. Standalone AssemblyScript Test Frameworks

**assemblyscript-unittest-framework** and **as-test** are both solid, actively-maintained testing frameworks for
AssemblyScript.

Choose this pool if:
- You're already using Vitest for JS/TS tests
- You want Vitest reporters, UI, and coverage tooling to work
- You want one test command, one config, one watch mode
- You're curious to see if our parallel approach is potentially faster

Choose alternatives if:
- You don't need Vitest ecosystem integration
- You prefer dedicated CLI tools
- You're working on an AS-only project (although we support this too)

**Technical differences:**
- **Crash isolation**: We use per-test WASM instances, so one test abort won't kill any others
- **Parallel execution**: Concurrent compilation, discovery, and test execution across worker threads
- **Test counting**: assemblyscript-unittest-framework counts assertions as tests; we count test blocks
- **In-Memory**: Cached, in-memory binaries and source maps for minimal file I/O

**as-pect:**
- Unmaintained since 2022, incompatible with modern AssemblyScript

### vs. Manual WASM Testing in Vitest
- No boilerplate `fs.readFileSync()` + `WebAssembly.instantiate()`, etc
- Automatic test discovery
- Per-test WASM instance isolation provides crash tolerance
- Built-in LCOV coverage reporting
- Rich test matchers and lifecycle hooks
- Test runner and reporter

---

## How It Works

Built on the Vitest 3.x [`ProcessPool` API](https://v3.vitest.dev/advanced/pool.html) for alternative runtime execution.

### Architecture

To be documented here when it is fully stable.

### What You Get from Vitest
- Runner infrastructure and state management
- Watch mode and file watching
- Reporters (terminal, UI, coverage)
- Test filtering and patterns
- Standard configuration

---

## Project Status & Expectations

**This is an early-stage hobby project** being developed in the open. The hard parts (WASM isolation, coverage instrumentation, Vitest integration) are proven and working. What's left is polish, configuration, matchers, and documentation.

*(Note: Not yet published to npm - currently development only)*

### Working Now
- ✅ Vitest pool integration with tinypool parallelization
- ✅ Per-test WASM instance isolation
- ✅ Test discovery and registration
- ✅ Basic `test()` and `assert()` API
- ✅ Binary caching between runs
- ✅ Source-mapped error messages
- ✅ Dual-mode coverage, Failsafe mode coverage
- ✅ LCOV coverage output
- ✅ Console reporting through Vitest

### In Progress
- 🚧 Rich matcher API (`expect().toBe()`, `toEqual()`, `toBeCloseTo()`, etc.)
- 🚧 Nested `describe()` blocks and lifecycle hooks (`beforeEach()`, `beforeAll()`, etc.)
- 🚧 Configurable ASC compiler options
- 🚧 Configuration docs and examples
- 🚧 Internal test suite for stability
- 🚧 Edge case hardening

### Planned Before First Release
- 📋 Branch/statement coverage tracking
- 📋 Coverage-guided test selection
- 📋 Watch mode optimization
- 📋 AssemblyScript compiler options
- 📋 User-provided memory factory

### Planned For Future
- 📋 Full vitest reporter integration
- 📋 Mocking utilities
- 📋 JS Integration harness with browser runners

### Out of Scope (Currently - I would love to do this in the future)
- ✖️ Compiler intergration with other compile-to-WASM languages
- ✖️ Generic testing of precompiled WASM binaries

---

## Installation Guide (Development Preview)

**⚠️ Important:** This project is under active development. Features and APIs may change without notice. No guarantees are made about stability or functionality.

**Feedback Welcome:** If you try this out, please open an issue on GitHub with your experience, bugs, or suggestions!

### Prerequisites
- Node.js 20.0.0 or higher
- Vitest 3.2.4 or higher (3.x.x probably works, not yet tested)
- AssemblyScript 0.28+ in your project (likely works with 0.25+, not yet tested)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/matchamike/vitest-pool-assemblyscript.git
cd vitest-pool-assemblyscript
npm install
npm run build
```

2. **Link the pool to your project:**
```bash
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

    globals: false,
    environment: 'node',

    // Use the AssemblyScript pool
    pool: 'vitest-pool-assemblyscript',

    // Pool-specific options
    poolOptions: {
      assemblyScript: {
        // Coverage modes: 'integrated' | 'failsafe' (default: 'failsafe')
        // - failsafe: Smart re-run - instrumented first, re-run failures on clean (default, optimal)
        // - integrated: Single instrumented binary (fast, but errors have wrong line numbers)
        coverageMode: 'failsafe',

        // Strip @inline decorators for better coverage accuracy
        stripInline: true,

        // Enable debug logging (shows compilation, execution flow)
        debug: false
      }
    }
  }
});
```

If you need to run tests in multiple pools (e.g. JS in one, AssemblyScript in the other), use the projects feature:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // JavaScript runtime tests
        extends: true,
        test: {
          include: ['tests/**/*.{test,spec}.{ts,js}'],
          name: 'my-javascript-tests',
          environment: 'node',
          // remaining JS config...
        }
      },
      {
        // AssemblyScript tests
        test: {
          include: ['tests/assembly/**/*.as.{test,spec}.{ts,js}'],
          name: 'my-assemblyscript-tests',
          environment: 'node',
          // remaining AS config...
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
# Run all tests
npm test

# Run specific test file
npm test example.as.test.ts
```

---

## License

MIT
