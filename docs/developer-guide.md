# Developer Guide

This guide is for contributors and maintainers working on `vitest-pool-assemblyscript` itself. For using the pool in your own project, see the [Quick Start](../README.md#quick-start) and [Configuration Guide](configuration-guide.md).

---

**Table of Contents**
- [Source Code Orientation](#source-code-orientation)
- [Prerequisites](#prerequisites)
- [Developer Setup](#developer-setup)
- [Configuration Reference](#configuration-reference)
- [Testing](#testing)
- [Debugging & Troubleshooting](#debugging--troubleshooting)

---

## Source Code Orientation

If you're new to the codebase, this reading order will help you build a mental model of how the pool works:

1. **Entry point**: [`src/pool/pool-runner-init.ts`](../src/pool/pool-runner-init.ts) - `createAssemblyScriptPool()` factory. This is what vitest calls to create the pool.
2. **Orchestration**: [`src/pool/pool-worker.ts`](../src/pool/pool-worker.ts) - `AssemblyScriptPoolWorker`. Manages file dispatch, timeout enforcement, and thread pool lifecycle.
3. **Compilation**: [`src/pool-thread/runner/compile-runner.ts`](../src/pool-thread/runner/compile-runner.ts) - `runCompileAndDiscover()`. Compiles AS to WASM and discovers tests. Compiler setup and transform registration in [`src/compiler/index.ts`](../src/compiler/index.ts); AS compiler transforms (deep equality injection, inline stripping) in [`src/compiler/transforms/`](../src/compiler/transforms/).
4. **Test execution**: [`src/pool-thread/runner/test-runner.ts`](../src/pool-thread/runner/test-runner.ts) - `runSuite()` and `runTest()`. Runs tests and reports results via RPC.
5. **WASM executor**: [`src/wasm-executor/index.ts`](../src/wasm-executor/index.ts) - `executeWASMDiscovery()` and `executeWASMTest()`. Creates WASM instances and manages the JS↔WASM boundary.
6. **Error handling**: [`src/wasm-executor/wasm-errors.ts`](../src/wasm-executor/wasm-errors.ts) - `enhanceTestError()`. Source-maps WASM errors back to AssemblyScript source.
7. **Coverage**: [`src/instrumentation/`](../src/instrumentation/) (native addon, debug extraction, instrumentation) → [`src/coverage-provider/`](../src/coverage-provider/) (hybrid provider, containment matching, Istanbul conversion). See [Coverage Architecture](coverage-architecture.md).

For architecture details, see [Pool Architecture](pool-architecture.md) and [Coverage Architecture](coverage-architecture.md).

---

## Prerequisites

See the Readme's [Compatibility section](../README.md#compatibility) for information on supported Node versions and platforms.

Additionally for developers:

**C++ build tools** (for native addon development):
- C++20 compiler support required ([GCC 10+ or Clang 10+](https://en.cppreference.com/cpp/compiler_support/20))
- Python 3.x (required by node-gyp)

The distributed npm package includes prebuilt native binaries for [most platforms](../README.md#compatibility), so *end users* don't need C++ tools. These are only needed when developing the native addon or building from source.

---

## Developer Setup

### 1. Clone the repository

```bash
git clone https://github.com/themattspiral/vitest-pool-assemblyscript.git
cd vitest-pool-assemblyscript
```

### 2. Download Binaryen C++ dependencies

```bash
npm run setup-binaryen
```

This downloads prebuilt Binaryen libraries and C++ headers to `third_party/binaryen/`. These are required to compile the native addon from source during development. The package install script (`scripts/install-native-addon.js`) also uses this if it needs to fall back to a source build when no prebuilt binary matches the platform.

### 3. Install npm dependencies

```bash
npm install
```

### 4. Build the native addon

```bash
npm run build:native
```

This compiles the C++ native addon (`src/instrumentation/native/addon.cpp`) using `node-gyp`. You need to re-run this when you change:
- `src/instrumentation/native/addon.cpp`
- `binding.gyp`

> ℹ️ **Before testing native changes *externally*, run `npm run build:prebuild` instead.** `build:native` updates only `build/Release`, which *local* tests load. External tests run against an `npm pack`-ed tarball that ships only `prebuilds/` (never `build/`), so `build:native` alone leaves a stale prebuild for external runs. `build:prebuild` (prebuildify) rebuilds both `build/Release` and `prebuilds/` from one source build, making it the safe single command for local and external alike.

### 5. Build the pool

```bash
npm run build
```

This compiles the TypeScript pool source to `dist/`. The build must be run after you make changes before executing tests - vitest, the worker threads, and the AS compiler all load the pool from compiled output (see [why](#local-vs-external-testing)). You need to re-run this when you change any TypeScript source files under `src/`.

You do **not** need to rebuild for changes to AssemblyScript test source (`assembly/`, `test/assembly-src/`)

Build+test shortcut commands are available - see [DX Command Reference](#dx-command-reference).

---

## Configuration Reference

Understanding the pool's configuration options is important for development and testing. The [Configuration Guide](configuration-guide.md) documents all supported options:

- [AssemblyScript Pool Options](configuration-guide.md#assemblyscript-pool-options) - pool-specific settings (compiler flags, memory sizing, debug options, etc.)
- [Supported Vitest Config Options](configuration-guide.md#supported-vitest-config-options) - which standard vitest options are supported
- [Config Templates](configuration-guide.md#config-templates) - example configurations for v3 and v4

---

## Testing

### Test Organization - Local vs External

#### Local Tests

**Local tests** run the pool against bundled/transpiled TypeScript in `dist/`, using vitest's project configuration. This is the primary development feedback loop during development:

```bash
npm test          # Run all local tests (passing + meta output verification)
npm run ptest     # Run local passing tests only (shortcut)
npm run mvtest    # Run local meta output verification (shortcut)

npm run mtest     # Run local meta tests for debugging (shortcut)
```

**Why we run against compiled output:** The pool's TypeScript source must be compiled to JavaScript before tests can run. This isn't a limitation we can easily work around with `tsx`, `ts-node`, or Node's native type stripping, because three separate parts of the pool load compiled JavaScript outside of Vite's transform pipeline:

1. **Pool entry point** - The vitest config imports the pool via its package name (`vitest-pool-assemblyscript/config`), which resolves through the package.json `exports` map to `dist/`
2. **Worker threads** - The pool spawns compile and test workers using [Tinypool](https://github.com/tinylibs/tinypool) (Node [Worker threads](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html)), which requires resolved JavaScript file paths. These workers run in plain Node, not through Vite.
3. **Compiler transform** - The [AssemblyScript compiler](https://www.assemblyscript.org/compiler.html#transforms) loads a `--transform` module by path via dynamic `import()`, which also needs to be compiled JavaScript.

As such, when you make changes to pool source code (not just tests), you should build before running tests. We have shortcuts for this:

```bash
npm run cptest     # Build + Run local passing tests only (shortcut)
npm run cmvtest    # Build + Run local meta output verification (shortcut)

npm run cmtest     # Build + Run local meta tests for debugging (shortcut)
```

#### External Tests

**External tests** validate the published package by running against an `npm pack`-ed and installed tarball. The [`scripts/setup-test-external.js`](../scripts/setup-test-external.js) script:
1. Cleans the sibling directory `../vitest-pool-assemblyscript-test-external/`
2. Copies the version-specific external template directory (selected by the `VITEST_VERSION` env var — see below) into it
3. Runs `npm pack` to create a tarball
4. Installs the tarball and dependencies in the external directory

> ℹ️ **Native/C++ changes:** run `npm run build:prebuild` before any external run — external installs load the packed `prebuilds/`, not `build:native`'s `build/Release` output, so `build:native` alone leaves a stale prebuild. See [Build the native addon](#4-build-the-native-addon).

#### Native Addon Build for External Install (and why CI ships prebuilds)

An installed tarball obtains the coverage addon one of two ways:

- **Shipped prebuild:** when the tarball contains `prebuilds/`, `npm install` just unpacks it and `node-gyp-build` loads the addon at runtime — **no install script needed.**
- **Source build at install:** otherwise the package's `install` script ([`install-native-addon.js`](../scripts/install-native-addon.js)) compiles the addon during `npm install`, into the external `node_modules/vitest-pool-assemblyscript/build/Release`

The source-build path relies on npm (or your package manager) running a dependency's install script, which is not guaranteed due to improving secure defaults:
- npm **≥ 11.16.0** (bundled with Node 24) flags un-approved dependency install scripts — `npm warn allow-scripts ... not yet covered by allowScripts`. Today this is **warn-but-run**: the script still executes, but its output is hidden by the default `foreground-scripts=false`, so a successful build prints nothing (which makes it *look* like the script never ran even though the addon is built)
- The `--strict-allow-scripts` option makes npm **block** the install before any script runs (a preflight throws `ESTRICTALLOWSCRIPTS`).
- In npm **≥ 12** strict mode will become the default, and a source-build-only external install would get **no addon → coverage disabled → the 100% coverage thresholds fail**
- The [`ci.yml`](../.github/workflows/ci.yml) workflow runs `npm ci` with `VITEST_POOL_AS_SKIP_NATIVE_BUILD=1` (skip the redundant source build), then `setup-binaryen` + `build:prebuild`, **before** the external setup. `npm pack` then ships `prebuilds/`, so the external install loads the addon by unpacking alone

#### Three Parallel External Template Directories

External tests run against each supported vitest major version, and **each version has its own template directory**. `setup-test-external.js` chooses one based on the `VITEST_VERSION` env var:

| Template dir | Vitest version | Selected by |
|---|---|---|
| `test-external/` | 5.x (default) | `test:ext:setup` (no `VITEST_VERSION`) |
| `test-external-v4/` | 4.x | `test:ext:setup:v4` (`VITEST_VERSION=4`) |
| `test-external-v3/` | 3.x | `test:ext:setup:v3` (`VITEST_VERSION=3`) |

Each directory contains its own `vitest.pass.config.ts` and `vitest.meta.config.ts`. They are **parallel templates with no shared base config**, so any change to an external config (a new project, a glob, a `globalSetup`, etc.) must be replicated across **all three** directories. Note that the v3 configs use the v3 config API (`defineAssemblyScriptConfig` / `poolOptions`) rather than `createAssemblyScriptPool`, so the equivalent change there differs in form.

> ℹ️ **v3 Exception — version-specific scheduling.** vitest 3 runs all distinct pools concurrently using `Promise.all`, with no shared worker cap (see [Cross-Pool Scheduling](pool-architecture.md#cross-pool-scheduling)). A multi-pool external run — the AS pool alongside the `threads`-pool `ts-pool` project — can oversubscribe the CPU (the AS pool is compile- and execute-heavy), slowing the run and risking timeouts on timing-sensitive work. Separating the pools with `sequence.groupOrder` is therefore a **`test-external-v3/`-only** change: vitest 4/5 already bound total concurrency through one shared pool, so the same setting there would only over-serialize.

This validates that dist output, package.json exports, entry points, prebuilt binaries, and bundled dependencies all work correctly in a real install scenario. These shortcuts are the most frequently used:

```bash
npm run eptest    # External passing tests (setup + run - shortcut)
npm run emvtest   # External meta output verification (setup + run - shortcut)

npm run emtest    # External meta tests for debugging (setup + run - shortcut)
```

### Test Category - Standard vs Meta

**Standard tests** (`.test.ts` files in `test/assembly/`) are expected to pass 100% of the time, as a normal test suite would be. They validate pool features (matchers, test options, coverage collection, suites) and enforce coverage thresholds. Their AssemblyScript source lives in `test/assembly-src/*.ts`.

**Meta tests** are designed to fail, timeout, produce errors, or otherwise exercise vitest behavior. They verify that the pool handles error scenarios correctly: failed assertions produce proper diffs, timeouts trigger with correct behavior, compilation errors are reported cleanly, retry logic works, etc. The meta suite includes both AS tests (`.meta.test.ts` files in `test/assembly/`, with source in `test/assembly-src/*.meta.ts`) and JS/TS tests (`test/js-coverage-parity/`, with source in `test/js-coverage-parity-src/`) for hybrid coverage verification. AS meta sources are excluded from coverage thresholds.

### Generated Fixtures

Some fixtures are too large to cleanly commit as source. The large function count stress fixture, for instance, needs more instrumented functions than fit in a single coverage-memory page (>16,384) — roughly 34k lines of generated AssemblyScript. Rather than commit that output, we **commit a small parameterized generator and emit the fixture at test time** into the gitignored `test-generated/` directory. This is the same scaffolding-by-script approach used by [`scripts/setup-test-external.js`](../scripts/setup-test-external.js), which likewise produces its test inputs programmatically rather than committing them.

[`test/generators/global-setup-large-fixture.js`](../test/generators/global-setup-large-fixture.js) generates the large coverage fixture:

- It is wired as a vitest [`globalSetup`](https://vitest.dev/config/#globalsetup) on the passing and meta configs, so it runs once before any test workers spawn and regenerates the fixture on every run.
- It writes the AssemblyScript source (`test-generated/assembly-src/`) plus the test files that import it (`test-generated/assembly/`), all derived from a single function-count parameter (overridable via the `LARGE_FIXTURE_FN_COUNT` env var).
- Paths resolve against the main repo via `import.meta.url`, so generation writes to the correct location even when vitest runs from the external sibling install directory (where its cwd differs).
- `test-generated/` is gitignored, so the output never appears in the repo — only the generator is reviewed.

The fixture provides a large-scale workload for containment matching and pushes coverage counters past the one-page memory boundary: a **passing** test executes every instrumented function (with the default auto-sized coverage memory, the high-index counters in page ≥2 must store without trapping).

> ℹ️ The `globalSetup` is wired into the external configs as well, so it falls under the [Three Parallel External Template Directories](#three-parallel-external-template-directories) rule — the `globalSetup` entry and the project that consumes the fixture must appear in all three external template dirs.

### Meta Test Verification

The meta test system needs to verify *how* tests fail, not just *that* they fail. Meta verification tests the full user-facing output after the entire error pipeline: WASM error → pool error handling (`enhanceTestError`) → vitest reporter → rendered CLI output. This includes error names, formatted actual/expected values, diff rendering, and source-mapped stack traces — the complete error block as the user sees it.

#### Why meta-verify for matcher failure messages

For matcher failure output specifically, `toThrowError` is an alternative — it can catch both explicit throws and assertion failures (since failed assertions call `abort()`). However, it only verifies the WASM-side message substring. It cannot verify the **error type classification** (`AssertionError` vs `WASMRuntimeError`) that appears in the user's output — that classification happens in the JS error pipeline after the WASM abort. Since error type is observable behavior per scenario, meta-verify is used to test it without relying on implementation assumptions about the error pipeline.

A [`globalSetup`](../test/meta-verify/helpers/global-setup-capture-meta-run.ts) runs the meta suite once before any verification test workers spawn, capturing output and writing it to a results file. This eliminates duplicate meta suite runs and race conditions on shared output files. The flow:

1. The globalSetup calls [`scripts/run-vitest-external.js`](../scripts/run-vitest-external.js) in **capture mode**, which runs vitest with piped stdio and returns `{ jsonOutput, cliOutput, exitCode }`
2. The globalSetup writes the captured data (plus `cwd` and `coverageEnabled`) to `tmp/.meta-verify-results.json` at the project root
3. Verification tests load the pre-computed results via shared helpers in [`test/meta-verify/helpers/shared.ts`](../test/meta-verify/helpers/shared.ts):
   - **JSON output** is loaded directly for structured assertions (test status, counts, hierarchy)
   - **CLI output** is stripped of ANSI codes once and parsed into pre-indexed maps: error blocks keyed by full test path (from FAIL headers), and coverage table rows keyed by directory-qualified path. Lookups are O(1) map gets with uniqueness validation.
   - **`TEST_FILE_PREFIX`** adjusts error block lookup keys for the run context - in external context, vitest reports file paths with a `../vitest-pool-assemblyscript/` prefix since it runs from a sibling directory
4. Coverage verification tests additionally read `coverage-final.json` from the coverage output directory (path derived from `cwd` in the results file)
5. The globalSetup teardown cleans up `.meta-verify-results.json` when the verification run completes

The `RUN_CONTEXT` environment variable (set via `cross-env` in the npm scripts) determines which verification context is used:
- **`local`** (default) - runs the meta suite against local `dist/` output
- **`external`** - runs the meta suite against the installed package in `../vitest-pool-assemblyscript-test-external/`, with coverage enabled

`RUN_CONTEXT` also drives the `COVERAGE_ENABLED` and `TEST_FILE_PREFIX` constants exported from `shared.ts`, which verification tests use to conditionally run coverage assertions and construct correct lookup keys.

Verification tests live in `test/meta-verify/` and are organized by category:
- [`test/meta-verify/test-options.test.ts`](../test/meta-verify/test-options.test.ts) - test option behavior (skip, only, fails, retry) via JSON output
- [`test/meta-verify/expect-matchers/`](../test/meta-verify/expect-matchers/) - matcher failure messages scoped to individual error blocks via CLI output
- [`test/meta-verify/coverage-collection/`](../test/meta-verify/coverage-collection/) - coverage collection assertions, split by scenario type (basic, edge, structure, inheritance, modules, reexports, locations, execution, summary)

[`scripts/run-vitest-external.js`](../scripts/run-vitest-external.js) supports two modes:
- **Interactive mode**: stdio inherited, output streams directly to terminal (used by npm scripts like `mtest` and `eptest` for manual runs)
- **Capture mode**: async spawn with piped stdio, returns `{ jsonOutput, cliOutput, exitCode }` (used by the globalSetup)

### Vitest Configuration

| Config File | Purpose | Projects |
|-------------|---------|----------|
| [`vitest.config.ts`](../vitest.config.ts) | Local passing tests | `ts-pool` (TypeScript pool unit tests), `as-pool-passing` (AS passing tests) |
| [`vitest.meta.config.ts`](../vitest.meta.config.ts) | Local meta tests | `as-pool-meta` (AS meta tests), `js-coverage-parity` (JS/TS meta example fixtures) |
| [`vitest.meta-verify.config.ts`](../vitest.meta-verify.config.ts) | Meta output verification (all contexts) | `ts-pool-meta-verify` (verification tests with globalSetup) |
| [`test-external/vitest.pass.config.ts`](../test-external/vitest.pass.config.ts) (+ `test-external-v4/`, `test-external-v3/` variants) | External passing tests (v5 default, v4, v3) | `as-pool-passing` (AS passing tests with 100% coverage thresholds) |
| [`test-external/vitest.meta.config.ts`](../test-external/vitest.meta.config.ts) (+ `test-external-v4/`, `test-external-v3/` variants) | External meta tests (v5 default, v4, v3) | `as-pool-meta` (AS meta tests), `js-coverage-parity` (JS/TS meta example fixtures) |

> ℹ️ **External configs come in three parallel copies** — `test-external/` (v5), `test-external-v4/`, and `test-external-v3/` — each with its own `vitest.pass.config.ts` and `vitest.meta.config.ts`. A change to one must be made in all three. See [Three Parallel External Template Directories](#three-parallel-external-template-directories).

### DX Command Reference

| Shortcut | Command | Function |
|----------|---------|-------------|
| `npm test` | - | Run all local tests (v5 only, passing + meta output verification) |
| `npm run ptest` | `npm run test:pass` | Run local passing tests |
| `npm run mtest` | `npm run test:meta` | Run local meta tests |
| `npm run mvtest` | `npm run test:meta:verify` | Run local meta output verification |
| - | `npm run test:ext:setup` | Prepare external test directory (v5) |
| `npm run eptest` | `npm run test:ext:pass` | Run external passing tests (setup + run) |
| `npm run emtest` | `npm run test:ext:meta` | Run external meta tests (setup + run) |
| `npm run emvtest` | `npm run test:ext:meta:verify` | Run external meta output verification (setup + run) |
| - | `npm run test:ext:setup:v4` | Prepare external test directory (v4) |
| `npm run ep4test` | `npm run test:ext:setup:v4 && npm run test:ext:pass` | Run external v4 passing tests (setup + run) |
| `npm run em4test` | `npm run test:ext:setup:v4 && npm run test:ext:meta` | Run external v4 meta tests (setup + run) |
| `npm run emv4test` | `npm run test:ext:setup:v4 && npm run test:ext:meta:verify` | Run external v4 meta output verification (setup + run) |
| - | `npm run test:ext:setup:v3` | Prepare external test directory (v3) |
| `npm run ep3test` | `npm run test:ext:setup:v3 && npm run test:ext:pass` | Run external v3 passing tests (setup + run) |
| `npm run em3test` | `npm run test:ext:setup:v3 && npm run test:ext:meta` | Run external v3 meta tests (setup + run) |
| `npm run emv3test` | `npm run test:ext:setup:v3 && npm run test:ext:meta:verify` | Run external v3 meta output verification (setup + run) |
| `npm run eetest` | `npm run aetest && npm run ae3test` | Run all external tests (v4 + v3, passing + meta output verification) |
| `npm run tcptest` | `npm run tc && npm run build && npm run ptest` | Type check + build + passing tests |
| `npm run cptest` | `npm run build && npm run ptest` | Build + local passing tests |
| `npm run cmtest` | `npm run build && npm run mtest` | Build + local meta tests |
| `npm run cmvtest` | `npm run build && npm run mvtest` | Build + local meta output verification |

**Key source files:**
- [`scripts/run-vitest-external.js`](../scripts/run-vitest-external.js) - vitest runner (interactive + capture modes)
- [`scripts/setup-test-external.js`](../scripts/setup-test-external.js) - external test directory setup
- [`test/meta-verify/helpers/global-setup-capture-meta-run.ts`](../test/meta-verify/helpers/global-setup-capture-meta-run.ts) - runs meta suite once, writes results for verification tests
- [`test/meta-verify/helpers/shared.ts`](../test/meta-verify/helpers/shared.ts) - shared types, CLI output parsing, and lookup helpers for all verification tests

---

## Debugging & Troubleshooting

### Debug Logging

Enable verbose debug logging throughout the pool by setting the `DEBUG` environment variable:

```bash
DEBUG=vitest_as_pool npx vitest run
```

This activates timestamped debug output from all pool components: compilation, test execution, coverage collection, RPC reporting, and the native addon.

### Debug Configuration Options

For more targeted debugging, individual debug options can be enabled in pool and coverage configuration:

| Option | Location | What it enables |
|--------|----------|----------------|
| `debug` | Pool options | Verbose logging for pool orchestration, compilation, test execution |
| `debugNative` | Pool options | Verbose logging from the native C++ addon (instrumentation, debug extraction) |
| `debugCoverageExtract` | Pool options | Verbose logging for coverage data extraction from WASM memory |
| `debugIstanbul` | Coverage options | Verbose logging for Istanbul format conversion (containment matching, hit counts) |

These can be set in your vitest config:

```typescript
// Pool debug options
pool: createAssemblyScriptPool({
  debug: true,
  debugNative: true,
  debugCoverageExtract: true,
}),

// Coverage debug option
coverage: {
  // ...
  debugIstanbul: true,
},
```

See the [Configuration Guide](configuration-guide.md) for full option documentation.
