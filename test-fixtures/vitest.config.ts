import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool, defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/config';


export default defineConfig({
  test: {
    globals: false,
    environment: 'node',

    name: 'test-fixtures',

    reporters: ['tree'],

    retry: 2,
    testTimeout: 500,
    isolate: false,

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

          retry: 0,
          testTimeout: 100,
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

          // bail: 5,
          retry: 1,
          testTimeout: 500,
          isolate: false,

          pool: createAssemblyScriptPool(),
          // pool: 'vitest-pool-assemblyscript',
          // poolOptions: {
          //   assemblyScript: {
          //     debug: false,
          //     stripInline: true,
          //     coverageMemoryPagesMax: 2
          //   },
          // },
        }
      }),
    ]
  },
});
