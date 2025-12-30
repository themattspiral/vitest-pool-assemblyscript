import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from '../src/config/index.js';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',

    name: 'test-fixtures',

    reporters: ['verbose'],

    retry: 2,
    // bail: 5,

    // Coverage configuration (must be global in vitest)
    coverage: {
      enabled: true,
      reportOnFailure: true,
      reportsDirectory: 'coverage-fixtures/',
      
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',

      // JS/TS sources to report coverage for
      include: [
        'test-fixtures/js-src/**/*.ts',
      ],
      
      // AS sources to report coverage for
      assemblyScriptInclude: [
        'test-fixtures/assembly-src/**/*.ts'
      ]
    },

    // js only
    // coverage: {
    //   enabled: true,
    //   reportOnFailure: true,
    //   reportsDirectory: 'coverage-fixtures/',
    //   include: ['test-fixtures/js-src/**/*.ts']
    // },

    projects: [
      // JavaScript/TypeScript tests (built-in pool)
      defineProject({
        test: {
          name: {
            label: 'ts-fixtures',
            color: 'blue'
          },

          include: [ 'test-fixtures/js/**/*.test.ts' ],

          testTimeout: 200,
          retry: 3,
        }
      }),

      // AssemblyScript tests (custom pool)
      defineAssemblyScriptProject({
        test: {
          name: {
            label: 'as-fixtrures',
            color: 'yellow'
          },

          include: ['test-fixtures/assembly/**/*.as.test.ts'],
          exclude: ['coverage-fixtures/**/*'],

          testTimeout: 500,
          retry: 1,

          pool: 'vitest-pool-assemblyscript',
          poolOptions: {
            assemblyScript: {
              debug: false,
              stripInline: true,
              coverageMemoryPagesMax: 2
            },
          },
        }
      }),
    ]
  },
});
