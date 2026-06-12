# Configuration Guide

* [AssemblyScript Pool Options](#assemblyscript-pool-options)
* [Supported Vitest Config Options](#supported-vitest-config-options)
* [Config Templates](#config-templates)
    * [vitest 4.x and 5.x Multiple-Project Template](#vitest-4x-and-5x-multiple-project-template)
    * [vitest 4.x and 5.x Single-Project Template](#vitest-4x-and-5x-single-project-template)
    * [vitest 3.2.x Multiple-Project Template](#vitest-32x-multiple-project-template)
    * [vitest 3.2.x Single-Project Template](#vitest-32x-single-project-template)

## AssemblyScript Pool Options

These options control how the pool processes and handles AssemblyScript. They're provided as an argument to `createAssemblyScriptPool()` (vitest v4+), or within the `poolOptions.assemblyScript` config section (vitest v3) - See [Config Templates](#config-templates) for placement.

- `stripInline` *(boolean)* — Strip `@inline` decorators during compilation so that inlined functions remain visible in coverage reports and source-mapped errors point to the correct lines. **Default: `true`**
- `testMemoryPagesInitial` *(number)* — Initial WASM memory size in [pages](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/Memory) (64 KiB each) allocated for each test instance. **Default: `1`**
- `testMemoryPagesMax` *(number)* — Maximum WASM memory size in pages. When set, memory can grow up to this limit during test execution. **Default: `undefined`** (no growth limit imposed by the pool)
- `wasmImportsFactory` *(string)* — Path to an ES module exporting a factory function that creates custom WASM imports. Path is relative to the vitest project root. See [Providing WASM Imports](providing-wasm-imports.md) for details.
- `extraCompilerFlags` *(string[])* — Additional flags passed to the AssemblyScript compiler (`asc`). **Default: `[]`**
- `maxThreadsV3` *(number)* — Maximum concurrent file execution threads. **vitest 3.x only** — for vitest 4.x and 5.x, use vitest's standard `test.maxWorkers` instead. **Default: `availableParallelism() - 1`**
>⚠️ `maxThreadsV3` is only configurable in the **top-level** config's `poolOptions.assemblyScript` section — the pool's shared thread pool is created once for the whole run, so values set in per-project `poolOptions` are ignored for thread sizing. (This mirrors vitest 3's own behavior, where `maxWorkers` and `poolOptions.*.maxThreads` only take effect from the root config.)

### Default Compiler Options

The pool compiles AssemblyScript with the following base flags. The first group are defaults that can be overridden via `extraCompilerFlags` (though not generally recommended). The second group are required for the pool to function and cannot be overridden.

**Overrideable defaults:**
- `--optimizeLevel 0` — No optimization, for easier debugging
- `--shrinkLevel 0` — No shrink
- `--runtime stub` — Stub runtime (no GC)

**Required (cannot be overridden):**
- `--importMemory` — Import memory from JS (enables imports during WASM start)
- `--debug` — Include debug info
- `--sourceMap` — Generate source maps for error reporting
- `--exportStart _start` — Export start function for explicit initialization control
- `--exportTable` — Export function table for direct test execution

## Supported Vitest Config Options

This is not an exhaustive list of all vitest options, but it details which ones are integrated specifically with the pool to allow controlling AssemblyScript test behavior.

### `test` section

- `bail` *(number)* — Stop the test run after this many test failures. Standard vitest option.
- `retry` *(number)* — Number of retries to attempt after a test's initial failure. Can also be set per-test with `TestOptions.retry()`.
>⚠️ While this is a standard vitest option, the pool currently only supports a `number`-based retry count, rather than the [enhanced config](https://vitest.dev/config/retry) introduced in vitest 4.1.0
- `testTimeout` *(number)* — Milliseconds to wait before terminating a test. Can also be set per-test with `TestOptions.timeout()`. Standard vitest option.
- `allowOnly` *(boolean)* — Whether to respect `test.only` and `describe.only` modifiers. Standard vitest option.
- `maxWorkers` *(number)* — Maximum concurrent file execution threads. **vitest 4.x and 5.x only** — for vitest 3.x, use pool option `maxThreadsV3` instead. Standard vitest option.
>ℹ️ `maxWorkers` values above the machine's core count are effectively clamped for AssemblyScript test execution — the pool's internal run threads are capped at `availableParallelism()`, so excess concurrent file tasks queue rather than oversubscribe the CPU.

### `coverage` section

These options control how the "hybrid" coverage provider handles reporting coverage for *both* AssemblyScript tests AND JavaScript tests (and technically any other pools configured in your project). These options are provided within the `coverage` config section.

- `provider` — Must be `'custom'` to use the hybrid coverage provider.
- `customProviderModule` — Must be `'vitest-pool-assemblyscript/coverage'`.
- `assemblyScriptInclude` *(string[])* — Glob patterns for AssemblyScript source files to include in coverage reporting. These are separate from the standard `include` patterns which apply to JS/TS files via v8.
- `assemblyScriptExclude` *(string[])* — Glob patterns for AssemblyScript source files to exclude from coverage reporting.

All other standard vitest v8 coverage options are passed through to the delegated v8 provider for JS/TS coverage. Common examples:
- `enabled` *(boolean)* — Enable coverage collection.
- `cleanOnRerun` *(boolean)* — Clean coverage results before re-running in watch mode.
- `reportsDirectory` *(string)* — Output directory for coverage reports.
- `reporter` *(string[])* — Coverage reporters to use (e.g. `['text', 'lcov', 'html']`).
- `include` *(string[])* — Glob patterns for JS/TS source files to include in v8 coverage.
- `exclude` *(string[])* — Glob patterns for JS/TS source files to exclude from v8 coverage.


## Config Templates

In your project's `vitest.config.ts`:
- The `test` project configuration helpers you use depend on which version of vitest you have.
- The `coverage` configuration is the same across versions (shown in the first example below).

### vitest 4.x and 5.x Multiple-Project Template
The is the most common use case: Side-by-side JavaScript and AssemblyScript test projects.

This configuration tells vitest to execute AS tests with the AssemblyScript custom pool, and to execute JavaScript tests with the default built-in pool (no `pool` configured for that project here). Both pools/projects send their collected test coverage data to a single "hybrid" coverage provider that handles both formats.

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
            wasmImportsFactory: 'test-helpers/create-imports.js',  // factory function to create your own WASM imports
            //extraCompilerFlags: ['--runtime', 'incremental'],    // additional asc flags to customize AS compilation
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

### vitest 4.x and 5.x Single-Project Template
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

### vitest 3.2.x Multiple-Project Template
```typescript
import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    poolOptions: {
      assemblyScript: {
        // v3: thread count is read from the TOP-LEVEL config only
        // maxThreadsV3: 8    // concurrent test file threads to execute (default: availableParallelism - 1)
      }
    },

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
              // same available options as v4+ createAssemblyScriptPool are passed here
              // (except maxThreadsV3, which is only read at the top level — see above)
            }
          }
        }
      })
    ]
  },
  
});
```

### vitest 3.2.x Single-Project Template
```typescript
import { defineAssemblyScriptConfig } from 'vitest-pool-assemblyscript/v3/config';

export default defineAssemblyScriptConfig({
  test: {
    pool: 'vitest-pool-assemblyscript/v3',
    poolOptions: {
      assemblyScript: {
        // same available options as v4+ createAssemblyScriptPool and v3 multi-project

        // With a single project this IS the top-level config, so maxThreadsV3 applies here
        // maxThreadsV3: 8    // concurrent test file threads to execute (default: availableParallelism - 1)
      }
    }
  },
});
```
