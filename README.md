# vitest-pool-assemblyscript

<p align="center">
  <img src="docs/images/as-icon.svg" height="50" align="middle">
  &nbsp;&nbsp;&#10133;&nbsp;&nbsp;
  <img src="docs/images/vitest-dark.svg" height="30" align="middle">
</p>

<p align="center">
  AssemblyScript unit testing for your Vitest workflow: Simple, fast, familiar, AS-native.
  <br/>
  <br/>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat"/></a>
  <a href="https://github.com/themattspiral/vitest-pool-assemblyscript/actions/workflows/release.yml"><img alt="Release Pipeline" src="https://github.com/themattspiral/vitest-pool-assemblyscript/actions/workflows/release.yml/badge.svg"/></a>
  <a href="https://www.npmjs.com/package/vitest-pool-assemblyscript"><img alt="npm package version" src="https://img.shields.io/npm/v/vitest-pool-assemblyscript.svg?style=flat&logo=npm"/></a>
</p>

---

<br/>

<p align="center">
  This <a href="https://vitest.dev/guide/advanced/pool.html">custom pool</a> plugs into <a href="https://vitest.dev">Vitest</a>, giving it the ability to compile AssemblyScript, run isolated WASM tests, and report with Vitest's reporters. It co-exists alongside your existing JavaScript/TypeScript tests and coverage reports, and is designed for simple incremental adoption.
</p>

<p align="center">
  <a href="#status">Status</a> | <a href="#quick-start">Quick Start</a> | <a href="#features">Features</a> | <a href="#compatibility">Compatibility</a> | <a href="#performance">Performance</a> | <a href="#prior-work">Prior Work</a> | <a href="#license">License</a>
  <br/>
  <a href="#writing-tests">Writing Tests</a> | <a href="docs/matchers-api.md">Matchers API</a> | <a href="docs/configuration-guide.md">Configuration Guide</a> | <a href="docs/providing-wasm-imports.md">Providing WASM Imports</a>
</p>

---

<br/>
<p align="center">
  <img src="docs/images/example-small.gif" alt="vitest-pool-assemblyscript demo">
</p>

## Status

This project is relatively new to the scene, but is being improved every day. Please give it a try!

- All [listed features](#features) are working and assumed to be bug-free ([report](https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new))
- [`describe()` and `test()` definition APIs](#writing-tests) are stable and not expected to change
- [`expect()` matchers API](docs/matchers-api.md) is stable and not expected to change. More are coming soon
- Native instrumentation prebuilds are available [across many platforms](#compatibility)
- See [Current Limitations & Roadmap](#current-limitations--roadmap) for important limitations to be aware of, and to see what's still planned.

Please [report a bug or request a feature](https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new) if you have something you'd like to share.

---

## Quick Start

### 1. Install

```bash
npm install -D vitest vitest-pool-assemblyscript assemblyscript
```

### 2. Configure Vitest

Create or update `vitest.config.ts`. See the [Configuration Guide](docs/configuration-guide.md) for all supported vitest options, pool options, coverage configuration, and multi-project setups.

**vitest 4.x:**
```typescript
import { defineConfig } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    include: ['test/assembly/**/*.as.test.ts'],
    pool: createAssemblyScriptPool(),
  },
  coverage: {
    provider: 'custom',
    customProviderModule: 'vitest-pool-assemblyscript/coverage',
    assemblyScriptInclude: ['assembly/**/*.ts'],
    enabled: true,
  },
});
```

**vitest 3.x:**
```typescript
import { defineAssemblyScriptConfig } from 'vitest-pool-assemblyscript/v3/config';

export default defineAssemblyScriptConfig({
  test: {
    include: ['test/assembly/**/*.as.test.ts'],
    pool: 'vitest-pool-assemblyscript/v3',
  },
  // coverage configuration mirrors v4
});
```

### 3. Write a Test

Create a test file (e.g. `test/assembly/example-file.as.test.ts`):

```typescript
import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";

test("basic math", () => {
  expect(2 + 2).toBe(4);
});

describe("an example suite", () => {
  test("string equality", () => {
    expect("hello").toBe("hello");
    expect("hello").not.toBe("world");
  });
});
```

### 4. Run

```bash
npx vitest run
```

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
- Assertion matching API based on vitest/jest `expect()` API
  - `.not`, `toBe`, `toBeCloseTo`, `toEqual` (with caveats*), `toStrictEqual`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`, `toBeLessThan`, `toBeLessThanOrEqual`, `toHaveLength`, `toThrowError`, `toBeTruthy`, `toBeFalsy`, `toBeNull`, `toBeNullable`, `toBeNaN`
  - See [Matchers API](docs/matchers-api.md) for details and differences from JavaScript
- Highlighted diffs for assertion and runtime failures, which point to source code
- Source-mapped WASM error stack traces (accurate AssemblyScript source `function file:line:column`)
- AssemblyScript console output captured and provided to vitest for display
- AssemblyScript compiler errors output plainly to the console for debugging
- AssemblyScript source code coverage based on WASM execution, including uncovered source
- No AssemblyScript boilerplate patterns for: `run()`, `endTest()`, `fs.readFile`, `WebAssembly.Instance`, etc

### Performance & Customization
- Parallel execution thread pools
- In-memory binaries and source maps for minimal file I/O
- Lightweight coverage instrumentation using separate WASM memory (no intermediate JS boundary crossing, no user memory conflicts)
- Coverage for inlined (`@inline`) code
- Enforced hard timeouts for long-running WASM via thread termination, with intelligent resume
- Configurable AssemblyScript compiler options
- Configurable test memory size
- User-provided WASM imports with access to test memory

---

## Compatibility

| Dependency | Supported Versions |
|---|---|
| Node.js | (20*), 22, 24+ |
| Vitest | 3.2.x, 4.x |
| AssemblyScript | 0.28+ |

>ℹ️ ***Node 20 Support:** If you don't need code coverage, Node 20 should continue to work for test execution.
>
>WASM coverage instrumentation is implemented using WebAssembly [multi-memory](https://github.com/WebAssembly/multi-memory) to isolate coverage counters from user test memory. This feature shipped in V8 12.0 / Node 22. 

**Platforms with prebuilt native binaries for coverage instrumentation & debug info:**

| | x64 | arm64 |
|---|---|---|
| Linux (glibc) | ✓ | ✓ |
| Linux (musl/Alpine) | ✓ | |
| macOS | ✓ | ✓ |
| Windows | ✓ | ✓ |

---

## Writing Tests

Import `test`, `describe`, `expect` from `vitest-pool-assemblyscript/assembly`. These functions are designed to follow the vitest API as closely as possible, so that everything is familiar and easy to reason about.

- `it` is available as an alias for `test`
- `describe` and `test` have inline modifiers to quickly change their status (see below)
- `TestOptions` allows per-test inline configuration of additional options

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

### Inline Modifiers: `.skip`, `.only`, `.fails`

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

`TestOptions` provides chainable configuration for `timeout`, `retry`, `skip`, `only`, and `fails`.
- Options can be placed before or after the callback
- Suite options are inherited by nested tests and suites

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

See the [Matchers API documentation](docs/matchers-api.md) for details on the available `expect()` methods you can use within your tests.

### Lifecycle Hooks (Setup & Teardown)

Coming Soon!

---

## Current Limitations & Roadmap

### Limitations

These are known limitations which are currently being worked on.

- **Function-level coverage only**: No statement, branch, or line coverage yet
- **No lifecycle hooks**: No setup/teardown hooks yet
- **Watch mode handles specs only**: Re-runs test files when they are directly changed, but not yet based on changed source files
- **`toEqual` doesn't reflect**: Doesn't yet support deep inspection of user-defined objects

### Near Future Roadmap

**Epic: Enhanced block-level coverage**
- Block-level statement coverage (line granularity)
- Branch coverage using CFG analysis
- All 4 coverage types (function, statement, branch, line)

**Epic: Testing DX**
- Lifecycle hooks (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`)
- Watch mode: re-run applicable tests on source file changes
- `toEqual` reflection for deep equality inspection of user objects
- `describe.for/each` and `test.for/each`
- expect.soft to prevent fail-fast behavior
- Allow delegating JS/TS to istanbul coverage provider in addition to v8
- Maybe: Per-file compilation setting override

**Epic: Expand expect matcher API**
- Planned: `toBeDefined`, `toBeUndefined`, `toContain`, `toContainEqual`
- Likely: `toBeOneOf`, `toBeTypeOf`, `toBeInstanceOf`, `toHaveProperty`, `toMatch`

**Epic: Spy and Mock**
- Intend to support

**✖️ Out of Scope (Currently):**
- Generic JS-harness testing of any precompiled WASM binary
- Compiler & matcher integration with other compile-to-WASM languages (e.g. Rust and C++ with Emscripten)
  - I would LOVE to expand this project to cover additional cases, supporting pluggable compilers, ast parsing, and matchers for different WASM ecosystems and toolchains
  - Not in scope now because of time and effort
  - If you want to pay me to work on this, please [get in touch](https://github.com/themattspiral)!

---

## Performance

Efforts have been made to compile and run tests as quickly as possible:
- Separate compile and test execution thread pools, workers, and runners for quicker startup and respawn
- Compile threads tuned to take advantage of significant Node V8 engine warmup time savings on consecutive AssemblyScript compilations
- In-memory compiled files and source maps to eliminate intermediate disk I/O
- Enforced hard timeouts for long-running WASM tests via thread termination, with intelligent resume

As such, it is capable of compiling dozens of test files comprising hundreds of tests in a few seconds.

<p align="center">
  <img src="docs/images/example-fixtures-suite.gif" alt="vitest-pool-assemblyscript demo">
</p>

---

## Prior Work

There are several core pieces of software without which this project would not be possible.

- This project makes direct use of the [AssemblyScript language](https://www.assemblyscript.org) and its fantastic [compiler](https://www.assemblyscript.org/compiler.html)
- Thanks to the [Vitest team](https://github.com/vitest-dev) for creating the framework in the first place and making it pluggable for different runtimes. Their internal pools were used as extensive reference in early phase development.
- The key component that allows us to perform WASM instrumentation is [Binaryen](https://github.com/WebAssembly/binaryen), a C++ toolchain infrastructure library for WebAssembly.
- Particular gratitude is owed to [assemblyscript-unittest-framework](https://github.com/wasm-ecosystem/assemblyscript-unittest-framework) for inspiring parts of our test discovery and instrumentation walking approaches.

---

## License

[MIT](LICENSE)
 - Portions of this software have been derived from third-party works which are licenced under different terms. Individual code contributions have been noted where applicable and are accompanied by their respective licenses.
 - See the license file and source code for details
