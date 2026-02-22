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
        '../vitest-pool-assemblyscript/test/js-example-meta-src'
      ],

      assemblyScriptInclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta.ts'
      ],

      // wide console for our CLI output verification
      reporter: [
        ['text', { maxCols: 200 }],
        ['html', {}],
        ['json', {}],
      ],

      debugIstanbul: false,
    },

    projects: [
      defineProject({
        test: {
          name: { label: 'ts-pool-meta-example', color: 'blue' },
          include: [
            '../vitest-pool-assemblyscript/test/js-example-meta/*.test.ts',
          ],
          exclude: [],
        }
      }),

      defineProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts'
          ],
          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
            _instrumentPoolInternals: false,
          }),
        }
      })
    ]
  },
});
