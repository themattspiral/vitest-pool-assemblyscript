import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

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
        'test/js-example-meta-src'
      ],
      
      assemblyScriptInclude: [
        'test/assembly-src/**/*.meta.ts'
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
            'test/js-example-meta/*.test.ts',
          ],
          exclude: [],
        }
      }),

      defineProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: ['test/assembly/**/*.meta.test.ts'],
          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            wasmImportsFactory: 'test/helpers/create-user-imports.js',
            _instrumentPoolInternals: false,
          }),
        }
      })
    ]
  },
});
