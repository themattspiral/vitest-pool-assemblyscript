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
      reportOnFailure: true,
      reportsDirectory: 'coverage/meta/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [
        'test/js-example-meta-src'
      ],
      
      assemblyScriptInclude: [
        'test/assembly-src/**/*.meta.ts'
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

    // TS Meta examples (to combine with AS coverage results)
    projects: [
      defineProject({
        test: {
          name: { label: 'ts-pool-meta-example', color: 'blue' },
          include: [
            'test/js-example-meta/*.test.ts',
          ],
          exclude: [],
        }
      }),

      // AS Meta - Failure conditions, and other external behavior verification (e.g. timeouts, retries)
      defineProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: ['test/assembly/**/*.meta.test.ts'],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'test/user-imports-factory/create-user-imports.js',
            extraCompilerFlags: ['--enable', 'simd'],
          }),
        }
      }),
      
      // AS Meta Alt Config - user import creation failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-create-fail', color: 'yellow' },
          include: ['test/assembly/**/*.meta-imports-create-fail.test.ts'],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'test/user-imports-factory/failing-create-user-imports.js',
          }),
        }
      }),
      
      // AS Meta Alt Config - user import load failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-load-fail', color: 'yellow' },
          include: ['test/assembly/**/*.meta-imports-load-fail.test.ts'],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'this/path/does_not_exist.js',
          }),
        }
      }),

      // AS Meta Alt Config - user import module missing failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-module-missing-fail', color: 'yellow' },
          include: ['test/assembly/**/*.meta-imports-module-missing.test.ts'],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'test/user-imports-factory/missing-module-create-user-imports.js',
          }),
        }
      }),
      
      // AS Meta Alt Config - user import function missing failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-function-missing-fail', color: 'yellow' },
          include: ['test/assembly/**/*.meta-imports-function-missing.test.ts'],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'test/user-imports-factory/missing-function-create-user-imports.js',
          }),
        }
      }),
      
      // AS Meta Alt Config - small test memory limit
      defineProject({
        test: {
          name: { label: 'as-pool-meta-small-mem', color: 'yellow' },
          include: ['test/assembly/**/*.meta-small-mem.test.ts'],
          pool: createAssemblyScriptPool({
            testMemoryPagesMax: 1,
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
          maxWorkers: 1,
          isolate: false,
          // required to force it to run separately from projects without maxWorkers: 1
          sequence: { groupOrder: 1 },

          name: { label: 'as-pool-meta-no-isolate', color: 'yellow' },
          include: ['test/assembly/**/*.meta-no-isolate.test.ts'],
          pool: createAssemblyScriptPool(),
        }
      }),
    ]
  },
});
