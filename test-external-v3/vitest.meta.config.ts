import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

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

      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              debug: false,
              debugNative: false,
              debugCoverageExtract: false,
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
              _instrumentPoolInternals: false,
            }
          },
        }
      })
    ]
  },
});
