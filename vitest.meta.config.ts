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
            wasmImportsFactory: 'test/helpers/create-user-imports.js',
            extraCompilerFlags: ['--enable', 'simd'],
          }),
        }
      }),
      
      // AS Meta Alt Config - user import failure
      defineProject({
        test: {
          name: { label: 'as-pool-meta-imports-fail', color: 'yellow' },
          include: ['test/assembly/**/*.meta-imports-fail.test.ts'],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'test/helpers/failing-create-user-imports.js',
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
    ]
  },
});
