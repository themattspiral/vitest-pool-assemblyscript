import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: [
      'json',
      'verbose'
    ],
    outputFile: { json: '.vitest-meta-json-output.json' },

    coverage: {
      enabled: true,
      allowExternal: true, // JS parity twins live in the main repo (../), outside this external root
      reportOnFailure: true,
      reportsDirectory: 'coverage/meta/',
      provider: 'custom',
      // Config-time JS-provider selection (see main vitest.meta.config.ts).
      customProviderModule: process.env.VITEST_AS_POOL_JS_PROVIDER === 'istanbul'
        ? 'vitest-pool-assemblyscript/coverage-istanbul'
        : 'vitest-pool-assemblyscript/coverage',
      
      // Intentionally `**`-anchored (not `../vitest-pool-assemblyscript`) because coverage.include
      // is matched against each file's absolute path, which never contains a `..` segment,
      // so a `../`-prefixed glob can't match. Using `**/` absorbs the absolute prefix,
      // and still matches the local relative path, so the same glob works local + external.
      include: [
        '**/js-coverage-parity-src/**/*.ts'
      ],

      assemblyScriptInclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta.ts',
        '../vitest-pool-assemblyscript/test-generated/assembly-src/**/*.meta*.ts'
      ],

      reporter: [
        ['text', {
          maxCols: 200,   // wide console for our CLI output verification
          skipFull: false // vitest forces skipFull: true on the text reporter in AI-agent environments
        }],
        ['html', {}],
        ['json', {}],
      ],

      debugIstanbul: false,
    },

    projects: [
    // TS Meta examples (to combine with AS coverage results)
      defineProject({
        test: {
          name: { label: 'js-coverage-parity', color: 'blue' },
          include: [
            '../vitest-pool-assemblyscript/test/js-coverage-parity/**/*.test.ts',
          ],
          exclude: [],
        }
      }),

      // AS Meta - Failure conditions, and other external behavior verification (e.g. timeouts, retries)
      defineProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts',
            '../vitest-pool-assemblyscript/test-generated/assembly/**/*.meta*.test.ts',
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/create-user-imports.js',
            extraCompilerFlags: ['--enable', 'simd'],
          }),
        }
      }),
      
      // AS Meta Alt Config - user import creation failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-create-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-create-fail.test.ts'
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/failing-create-user-imports.js',
          }),
        }
      }),
      
      // AS Meta Alt Config - user import load failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-load-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-load-fail.test.ts'
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'this/path/does_not_exist.js',
          }),
        }
      }),

      // AS Meta Alt Config - user import module missing failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-module-missing-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-module-missing.test.ts'
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/missing-module-create-user-imports.js',
          }),
        }
      }),
      
      // AS Meta Alt Config - user import function missing failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-function-missing-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-function-missing.test.ts'
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/missing-function-create-user-imports.js',
          }),
        }
      }),
      
      // AS Meta Alt Config - small test memory limit
      defineProject({
        test: {
          name: { label: 'as-pool-meta-small-mem', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-small-mem.test.ts'
          ],
          pool: createAssemblyScriptPool({
            testMemoryPagesMax: 1,
          }),
        }
      }),

      // AS Meta Alt Config - no strip-inline (honor @inline). Verifies that a branch
      // inside an @inline function (inlined into a caller in another file) is still
      // covered and attributed back to the @inline source.
      defineProject({
        test: {
          name: { label: 'as-pool-meta-no-strip-inline', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-no-strip-inline.test.ts'
          ],
          pool: createAssemblyScriptPool({
            stripInline: false,
          }),
        }
      }),

      // AS Meta Alt Config - incremental runtime. Runs *.meta-incremental.test.ts under
      // --runtime incremental, so that source's coverage accumulates with the default
      // (stub) runtime run across two binaries -- the only way the runtime-dependent
      // skip/drift coverage behavior manifests. Guards the breadth-first representative-
      // location search and the per-function SUM combiner.
      defineProject({
        test: {
          name: { label: 'as-pool-meta-incremental', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-incremental.test.ts'
          ],
          pool: createAssemblyScriptPool({
            extraCompilerFlags: ['--enable', 'simd', '--runtime', 'incremental'],
          }),
        }
      }),

      // AS Meta Alt Config - non-isolated single worker (batched file dispatch)
      // With isolate: false and maxWorkers: 1, vitest sends ALL matching files to a
      // single PoolWorker in ONE 'run' message (instead of the usual one file per
      // message). Verifies timeout enforcement and resume when the timed-out test
      // belongs to one file within a multi-file batch.
      defineProject({
        test: {
          isolate: false,
          maxWorkers: 1,
          // required to force it to run separately from projects without maxWorkers: 1
          sequence: { groupOrder: 1 },

          name: { label: 'as-pool-meta-no-isolate', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-no-isolate.test.ts'
          ],
          pool: createAssemblyScriptPool(),
        }
      }),

      // AS Meta Alt Config - small config-default timeouts. Fixtures here set NO
      // explicit timeouts, so hangs trip these config values — proving the
      // config-default resolution paths (testTimeout for test bodies, hookTimeout
      // for hooks) with values distinct from each other and from every explicit
      // per-test/per-hook value used elsewhere.
      defineProject({
        test: {
          testTimeout: 200,
          hookTimeout: 300,

          name: { label: 'as-pool-meta-default-timeouts', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-default-timeout.test.ts'
          ],
          pool: createAssemblyScriptPool(),
        }
      })
    ]
  },
});
