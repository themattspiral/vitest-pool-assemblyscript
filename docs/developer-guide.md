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

1. **Entry point**: [`src/pool/pool-runner-init.ts`](../src/pool/pool-runner-init.ts) — `createAssemblyScriptPool()` factory. This is what vitest calls to create the pool.
2. **Orchestration**: [`src/pool/pool-worker.ts`](../src/pool/pool-worker.ts) — `AssemblyScriptPoolWorker`. Manages file dispatch, timeout enforcement, and thread pool lifecycle.
3. **Compilation**: [`src/pool-thread/runner/compile-runner.ts`](../src/pool-thread/runner/compile-runner.ts) — `runCompileAndDiscover()`. Compiles AS to WASM and discovers tests.
4. **Test execution**: [`src/pool-thread/runner/test-runner.ts`](../src/pool-thread/runner/test-runner.ts) — `runSuite()` and `runTest()`. Runs tests and reports results via RPC.
5. **WASM executor**: [`src/wasm-executor/index.ts`](../src/wasm-executor/index.ts) — `executeWASMDiscovery()` and `executeWASMTest()`. Creates WASM instances and manages the JS↔WASM boundary.
6. **Error handling**: [`src/wasm-executor/wasm-errors.ts`](../src/wasm-executor/wasm-errors.ts) — `enhanceTestError()`. Source-maps WASM errors back to AssemblyScript source.
7. **Coverage**: [`src/instrumentation/`](../src/instrumentation/) (native addon, debug extraction, instrumentation) → [`src/coverage-provider/`](../src/coverage-provider/) (hybrid provider, containment matching, Istanbul conversion). See [Coverage Architecture](coverage-architecture.md).

For architecture details, see [Pool Architecture](pool-architecture.md) and [Coverage Architecture](coverage-architecture.md).

---

## Prerequisites

| Dependency | Version |
|---|---|
| Node.js | (20*), 22, 24+ |
| Vitest | 3.2.x, 4.x.x |
| AssemblyScript | 0.28.9+ |

>ℹ️ ***Node 20 Support:** Node 20 works for test execution, but WASM coverage instrumentation requires [WebAssembly multi-memory](https://github.com/WebAssembly/multi-memory) (V8 12.0+ / Node 22+).

>ℹ️ **Older AssemblyScript versions** might work but aren't actively tested. If you're stuck on an older version and run into issues, you're welcome to [open an issue](https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new).

**C++ build tools** (for native addon development):
- GCC 7+ or Clang 5+ (C++17 support required)
- Python 3.x (required by node-gyp)

The distributed npm package includes prebuilt native binaries for [most platforms](../README.md#compatibility), so end users don't need C++ tools. These are only needed when developing the native addon or building from source.

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

- [AssemblyScript Pool Options](configuration-guide.md#assemblyscript-pool-options) — pool-specific settings (compiler flags, memory sizing, debug options, etc.)
- [Supported Vitest Config Options](configuration-guide.md#supported-vitest-config-options) — which standard vitest options are supported
- [Config Templates](configuration-guide.md#config-templates) — example configurations for v3 and v4

---

## Testing

### Running Tests

The primary development feedback loop is local tests:

```bash
npm test          # Run all local tests (passing + meta output verification)
npm run ptest     # Run local "passing" tests only (shortcut)
npm run cptest    # Build + passing tests (shortcut)
npm run tcptest   # Type check + build + passing tests (shortcut)
```

### Test Organization

#### Local vs External Testing

**Local tests** run the pool "locally" against bundled/transpiled TypeScript in `dist/`, using vitest's project configuration. This is the primary development feedback loop during development:

```bash
npm test          # Run all local tests (passing + meta output verification)
npm run ptest     # Run local passing tests only (shortcut)
npm run mtest     # Run local meta tests (shortcut)
npm run mvtest    # Run local meta output verification (shortcut)
```

**Why we run against compiled output:** The pool's TypeScript source must be compiled to JavaScript before tests can run. This isn't a limitation we can easily work around with `tsx`, `ts-node`, or Node's native type stripping, because three separate parts of the pool load compiled JavaScript outside of Vite's transform pipeline:

1. **Pool entry point** — The vitest config imports the pool via its package name (`vitest-pool-assemblyscript/config`), which resolves through the package.json `exports` map to `dist/`
2. **Worker threads** — The pool spawns compile and test workers using [Tinypool](https://github.com/tinylibs/tinypool) (Node [Worker threads](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html)), which requires resolved JavaScript file paths. These workers run in plain Node, not through Vite.
3. **Compiler transform** — The [AssemblyScript compiler](https://www.assemblyscript.org/compiler.html#transforms) loads a `--transform` module by path via dynamic `import()`, which also needs to be compiled JavaScript.

As such, when you make changes to pool source code (not just tests), you should build before running tests. We have shortcuts for this:

```bash
npm run cptest     # Build + Run local passing tests only (shortcut)
npm run cmtest     # Build + Run local meta tests (shortcut)
npm run cmvtest    # Build + Run local meta output verification (shortcut)
```

**External tests** validate the published package by running against an `npm pack`-ed and installed tarball. The [`scripts/setup-test-external.js`](../scripts/setup-test-external.js) script:
1. Cleans the sibling directory `../vitest-pool-assemblyscript-test-external/`
2. Copies the `test-external/` template (configs, package.json) into it
3. Runs `npm pack` to create a tarball
4. Installs the tarball and dependencies in the external directory

This validates that dist output, package.json exports, entry points, prebuilt binaries, and bundled dependencies all work correctly in a real install scenario. These shortcuts are the most frequently used:

```bash
npm run eptest    # External passing tests (setup + run - shortcut)
npm run emtest    # External meta tests (setup + run - shortcut)
npm run emvtest   # External meta output verification (setup + run - shortcut)
```

#### Standard Tests vs Meta Tests

**Standard tests** (`.test.ts` files in `test/assembly/`) are expected to pass 100% of the time. They validate pool features (matchers, test options, coverage collection, suites) and enforce coverage thresholds. Their AssemblyScript source lives in `test/assembly-src/*.ts`.

**Meta tests** are designed to fail, timeout, produce errors, or otherwise exercise vitest behavior. They verify that the pool handles error scenarios correctly: failed assertions produce proper diffs, timeouts trigger with correct behavior, compilation errors are reported cleanly, retry logic works, etc. The meta suite includes both AS tests (`.meta.test.ts` files in `test/assembly/`, with source in `test/assembly-src/*.meta.ts`) and JS/TS tests (`test/js-example-meta/`, with source in `test/js-example-meta-src/`) for hybrid coverage verification. AS meta sources are excluded from coverage thresholds.

### Meta Test Verification

The meta test system needs to verify *how* tests fail, not just *that* they fail. A [`globalSetup`](../test/meta-verify/global-setup-capture-meta-run.ts) runs the meta suite once before any verification test workers spawn, capturing output and writing it to a results file. This eliminates duplicate meta suite runs and race conditions on shared output files. The flow:

1. The globalSetup calls [`scripts/run-vitest.js`](../scripts/run-vitest.js) in **capture mode**, which runs vitest with piped stdio and returns `{ jsonOutput, cliOutput, exitCode }`
2. The globalSetup writes the captured data (plus `cwd` and `coverageEnabled`) to `tmp/.meta-verify-results.json` at the project root
3. Verification tests read this pre-computed results file and assert on specific expected output
4. Coverage verification tests additionally read `coverage-final.json` from the coverage output directory (path derived from `cwd` in the results file)
5. The globalSetup teardown cleans up `.meta-verify-results.json` when the verification run completes

The `RUN_CONTEXT` environment variable (set via `cross-env` in the npm scripts) determines which verification context is used:
- **`local`** (default) — runs the meta suite against local `dist/` output
- **`external`** — runs the meta suite against the installed package in `../vitest-pool-assemblyscript-test-external/`, with coverage enabled
- **`external_no_coverage`** — same as `external` but with coverage disabled (for Node 20 or missing native build)

Verification tests live in `test/meta-verify/` and are organized by category:
- [`test/meta-verify/verify-output.test.ts`](../test/meta-verify/verify-output.test.ts) — JSON and CLI output assertions
- [`test/meta-verify/coverage-collection/`](../test/meta-verify/coverage-collection/) — coverage collection assertions, split by scenario type (basic, edge, structure, inheritance, modules, reexports, locations), with shared helpers in [`helpers.ts`](../test/meta-verify/coverage-collection/helpers.ts)

[`scripts/run-vitest.js`](../scripts/run-vitest.js) supports two modes:
- **Interactive mode**: stdio inherited, output streams directly to terminal (used by npm scripts like `mtest` and `eptest` for manual runs)
- **Capture mode**: async spawn with piped stdio, returns `{ jsonOutput, cliOutput, exitCode }` (used by the globalSetup)

### Vitest Configuration

| Config File | Purpose | Projects |
|-------------|---------|----------|
| [`vitest.config.ts`](../vitest.config.ts) | Local passing tests | `ts-pool` (TypeScript pool unit tests), `as-pool-passing` (AS passing tests) |
| [`vitest.meta.config.ts`](../vitest.meta.config.ts) | Local meta tests | `as-pool-meta` (AS meta tests), `ts-pool-meta-example` (JS/TS meta example fixtures) |
| [`vitest.meta-verify.config.ts`](../vitest.meta-verify.config.ts) | Meta output verification (all contexts) | `ts-pool-meta-verify` (verification tests with globalSetup) |
| [`test-external/vitest.pass.config.ts`](../test-external/vitest.pass.config.ts) | External passing tests | `as-pool-passing` (AS passing tests with 100% coverage thresholds) |
| [`test-external/vitest.meta.config.ts`](../test-external/vitest.meta.config.ts) | External meta tests | `as-pool-meta` (AS meta tests), `ts-pool-meta-example` (JS/TS meta example fixtures) |

### DX Command Reference

| Shortcut | Command | Function |
|----------|---------|-------------|
| `npm test` | — | Run all local tests (passing + meta output verification) |
| `npm run ptest` | `npm run test:pass` | Run local passing tests |
| `npm run mtest` | `npm run test:meta` | Run local meta tests |
| `npm run mvtest` | `npm run test:meta:verify` | Run local meta output verification |
| — | `npm run test:ext:setup` | Prepare external test directory |
| `npm run eptest` | `npm run test:ext:pass` | External passing tests (setup + run) |
| — | `npm run test:ext:pass:no-cov` | External passing tests without coverage - Used by CI for Node 20 runs |
| `npm run emtest` | `npm run test:ext:meta` | External meta tests (setup + run) |
| `npm run emvtest` | `npm run test:ext:meta:verify` | External meta output verification (setup + run) |
| — | `npm run test:ext:meta:verify:no-cov` | External meta output verification without coverage - Used by CI for Node 20 runs |
| `npm run tcptest` | `npm run tc && npm run build && npm run ptest` | Type check + build + passing tests |
| `npm run cptest` | `npm run build && npm run ptest` | Build + passing tests |
| `npm run cmtest` | `npm run build && npm run mtest` | Build + meta tests |
| `npm run cmvtest` | `npm run build && npm run mvtest` | Build + meta output verification |
| `npm run ceptest` | `npm run build && npm run eptest` | Build + external passing tests |
| `npm run cemtest` | `npm run build && npm run emtest` | Build + external meta tests |
| `npm run cemvtest` | `npm run build && npm run emvtest` | Build + external meta output verification |

**Key source files:**
- [`scripts/run-vitest.js`](../scripts/run-vitest.js) — vitest runner (interactive + capture modes)
- [`scripts/setup-test-external.js`](../scripts/setup-test-external.js) — external test directory setup
- [`test/meta-verify/global-setup-capture-meta-run.ts`](../test/meta-verify/global-setup-capture-meta-run.ts) — runs meta suite once, writes results for verification tests
- [`test/meta-verify/coverage-collection/helpers.ts`](../test/meta-verify/coverage-collection/helpers.ts) — shared types and helpers for coverage verification

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
