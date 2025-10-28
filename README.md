# vitest-pool-assemblyscript

**AssemblyScript testing for teams already using Vitest**

A [Vitest](https://vitest.dev/) custom pool that brings [AssemblyScript](https://www.assemblyscript.org/) testing into your existing Vitest workflow.

Features:
- Per-test WASM instance isolation for crash tolerance
- Source-mapped error messages (AssemblyScript function names, line & column numbers)
- Coverage tracking with LCOV output
- Smart execution for both accurate errors and coverage
- Familiar testing API (Vitest inspired)
- Parallel compilation, disovery, and test execution
- Cached, in-memory binaries and source maps

---

## Why This Exists

If you're a JavaScript/TypeScript team using Vitest and want to adopt AssemblyScript for performance-critical code, you face a choice:

- **Use standalone AS testing tools** → Learn new workflows, separate test commands, different coverage formats
- **Use generic WASM testing patterns** → Instantiation boilerplate, no test discovery, cryptic errors
- **Use this pool** → Keep using `vitest`, add `.as.test.ts` files, get familiar matchers and reporting

This pool bridges the gap between AssemblyScript and the modern JavaScript testing ecosystem. It's designed for incremental adoption - add AS modules to your existing codebase without changing your testing infrastructure.

**Status**: Early but functional - Core architecture validated and working. API surface and matchers under active development.

---

## What Makes This Different

### 1. **Vitest Ecosystem Integration** (The Big One)
- Use the same `vitest` command, config, and watch mode you already have
- Works with Vitest UI, reporters, and coverage tools
- Filter tests with familiar patterns: `vitest run math` or `vitest --coverage`
- No separate test runner to learn or configure

### 2. **Isolation**
- Each test runs in a fresh WASM instance
- One crashing test doesn't kill the rest

### 3. **Familiar Developer Experience**
- Jest/Vitest-like matchers (in progress): `expect(x).toBe(y)`, `toBeCloseTo()`, etc.
- No `endTest()` boilerplate required
- Console.log capture for debugging
- Configurable AS compiler options

### 4. **Better Coverage Architecture**
- Smart Re-Runs: "Failsafe" modes collects coverage on first run with an instrumentation; failed tests re-execute on clean binary to capture meaningful error output
- Optionally remove `@inline` decorators to gather coverage for normally inlined code

---

## Current Status

**Working Now:**
- ✅ Vitest pool integration with tinypool parallelization
- ✅ Per-test WASM instance isolation
- ✅ Test discovery and registration
- ✅ Basic `test()` and `assert()` API
- ✅ Binary caching between runs
- ✅ Source-mapped error messages
- ✅ Dual-mode coverage, Failsafe mode coverage
- ✅ LCOV coverage output
- ✅ Console reporting through Vitest

**In Progress:**
- 🚧 Configurable ASC compiler options
- 🚧 Rich matcher API (`expect().toBe()`, `toEqual()`, `toBeCloseTo()`, etc.)
- 🚧 Nested `describe()` blocks and lifecycle hooks (`beforeEach()`, `beforeAll()`, etc.)
- 🚧 Configuration docs and examples
- 🚧 Internal test suite for stability
- 🚧 Edge case hardening

**Planned Before First Release:**
- 📋 Per-test coverage tracking
- 📋 Coverage-guided test selection
- 📋 Watch mode optimization

**Planned for Future:**
- 📋 Full vitest reporter integration
- 📋 Mocking utilities
- 📋 JS Integration harness with browser runners

**Currently Out of Scope:**
 - Generic testing of precompiled WASM

---

## How It Works

Built on Vitest's [`ProcessPool` API](https://vitest.dev/advanced/pool) for alternative runtime execution.

### Architecture

To be documented here when it is fully stable.

### What You Get from Vitest
- Runner infrastructure and state management
- Watch mode and file watching
- Reporters (terminal, UI, coverage)
- Test filtering and patterns
- Standard configuration

---

## Why Not [Alternative]?

**vs. assemblyscript-unittest-framework:**
- Vitest: Integrate with your existing Vitest setup (watch mode, UI, familiar commands and reporters)
- Crash tolerance: Our per-test WASM instance isolation means one failing test doesn't stop others executing
- Faster: Parallel compilation, disovery, and test execution will maximize efficiency
- Cached, in-memory binaries and source maps
- More standard assertion vs test counting
- LCOV output

**vs. as-pect:**
- Active: as-pect is unmaintained (last update 2022) and incompatible with modern AssemblyScript versions
- We target teams already invested in Vitest

**vs. manual WASM instantiation in Vitest:**
- No boilerplate `fs.readFileSync()` + `WebAssembly.instantiate()`, etc
- Automatic test discovery
- Per-test WASM instance isolation provides crash tolerance
- Built-in LCOV coverage reporting

---

## Target Audience

This is for you if:
- ✅ You're using Vitest for JS/TS testing
- ✅ You want to add AssemblyScript for performance-critical modules
- ✅ You want to keep using familiar testing workflows
- ✅ You need accurate coverage for CI/CD

---

## Project Status & Expectations

**This is an early-stage hobby project** being developed in the open. The hard parts (WASM isolation, coverage instrumentation, Vitest integration) are proven and working. What's left is polish, configuration, matchers, and documentation.

**Current state:**
- Core architecture: ✅ Validated
- API stability: ⚠️ Expect breaking changes
- Production readiness: ❌ Not yet
- Documentation: ❌ Not yet

*(Note: Not yet published to npm - currently development only)*

---

## License

MIT