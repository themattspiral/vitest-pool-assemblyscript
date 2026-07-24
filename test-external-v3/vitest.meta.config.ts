import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: [
      'json',
      'default'   // v3 default is closest to v4 verbose
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

      // v3-specific override to use same coverage strategy as newer versions
      experimentalAstAwareRemapping: true,
      
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

          // force it to run separately from AS projects (sequentially).
          // this is a necessary v3 exception because it executes all ProcessPools concurrently
          sequence: { groupOrder: 1 },
        }
      }),

      // AS Meta - Failure conditions, and other external behavior verification (e.g. timeouts, retries)
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts',
            '../vitest-pool-assemblyscript/test-generated/assembly/**/*.meta*.test.ts',
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/create-user-imports.js',
              extraCompilerFlags: ['--enable', 'simd'],
            }
          },
        }
      }),

      // AS Meta Alt Config - user import creation failure
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta-imports-create-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-create-fail.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/failing-create-user-imports.js',
            }
          },
        }
      }),

      // AS Meta Alt Config - user import load failure
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta-imports-load-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-load-fail.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: 'this/path/does_not_exist.js',
            }
          },
        }
      }),
      
      // AS Meta Alt Config - user import module missing failure
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta-imports-module-missing-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-module-missing.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/missing-module-create-user-imports.js',
            }
          },
        }
      }),
      
      // AS Meta Alt Config - user import function missing failure
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta-imports-function-missing-fail', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-imports-function-missing.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/missing-function-create-user-imports.js',
            }
          },
        }
      }),
      
      // AS Meta Alt Config - small test memory limit
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta-small-mem', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-small-mem.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              testMemoryPagesMax: 1,
            }
          },
        }
      }),

      // AS Meta Alt Config - no strip-inline (honor @inline). Verifies that a branch
      // inside an @inline function (inlined into a caller in another file) is still
      // covered and attributed back to the @inline source.
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta-no-strip-inline', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-no-strip-inline.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              stripInline: false,
            }
          },
        }
      }),

      // AS Meta Alt Config - incremental runtime. Runs *.meta-incremental.test.ts under
      // --runtime incremental, so that source's coverage accumulates with the default
      // (stub) runtime run across two binaries -- the only way the runtime-dependent
      // skip/drift coverage behavior manifests. Guards the breadth-first representative-
      // location search and the per-function SUM combiner.
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta-incremental', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-incremental.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              extraCompilerFlags: ['--enable', 'simd', '--runtime', 'incremental'],
            }
          },
        }
      }),

      // AS Meta Alt Config - non-isolated single worker (batched file dispatch)
      //
      // NOTE: This project exists here for verification parity only — the meta-verify
      // suite is shared across vitest versions and requires these fixture files in the
      // captured run. The batched-dispatch scenario it exercises on vitest 4/5 (where
      // isolate: false + maxWorkers: 1 makes vitest send ALL matching files to a single
      // PoolWorker in ONE 'run' message) CANNOT occur on vitest 3: there is no PoolWorker
      // API, and the v3 ProcessPool receives all specs in one runTests() call and
      // dispatches per-file itself. The isolate/maxWorkers settings below are inert for
      // pool sizing in v3 (sizing comes from the root config at pool creation) and are
      // kept only to mirror the v4/v5 configs. On v3 these fixtures simply run as three
      // ordinary files; timeout behavior is still verified through the shared pipeline.
      defineAssemblyScriptProject({
        test: {
          // isolate: false,
          // maxWorkers: 1,
          
          name: { label: 'as-pool-meta-no-isolate', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-no-isolate.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',

        }
      }),

      // AS Meta Alt Config - small config-default timeouts. Fixtures here set NO
      // explicit timeouts, so hangs trip these config values — proving the
      // config-default resolution paths (testTimeout for test bodies, hookTimeout
      // for hooks) with values distinct from each other and from every explicit
      // per-test/per-hook value used elsewhere.
      defineAssemblyScriptProject({
        test: {
          testTimeout: 200,
          hookTimeout: 300,

          name: { label: 'as-pool-meta-default-timeouts', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta-default-timeout.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
        }
      })
    ]
  },
});
