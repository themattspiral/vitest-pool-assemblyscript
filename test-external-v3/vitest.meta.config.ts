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
      reportOnFailure: true,
      reportsDirectory: 'coverage/meta/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [
        '../vitest-pool-assemblyscript/test/js-example-meta-src'
      ],

      assemblyScriptInclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta.ts'
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
          name: { label: 'ts-pool-meta-example', color: 'blue' },
          include: [
            '../vitest-pool-assemblyscript/test/js-example-meta/*.test.ts',
          ],
          exclude: [],
        }
      }),

      // AS Meta - Failure conditions, and other external behavior verification (e.g. timeouts, retries)
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
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
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/failing-create-user-imports.js',
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
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/missing-module-create-user-imports.js',
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
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/missing-function-create-user-imports.js',
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
      })
    ]
  },
});
