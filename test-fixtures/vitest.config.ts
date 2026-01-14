import { defineConfig, defineProject, ViteUserConfig } from 'vitest/config';

import { createAssemblyScriptPool, defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/config';

const config: ViteUserConfig = defineConfig({
  test: {
    name: 'test-fixtures',
    
    globals: false,
    environment: 'node',

    reporters: ['tree'],
    // reporters: ['verbose'],

    retry: 2,
    testTimeout: 500,
    isolate: false,

    coverage: {
      enabled: true,
      reportOnFailure: true,
      reportsDirectory: 'coverage-fixtures/',
      
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',

      include: [
        'test-fixtures/js-src/**/*.ts',
      ],
      
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
          testTimeout: 500,
        }
      }),

      // v4
      defineProject({
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

          // v4
          pool: createAssemblyScriptPool({
            debug: false,
            stripInline: true,
            coverageMemoryPagesMax: 2,
          }),
        }
      }),
      
      // v3
      // defineAssemblyScriptProject({
      //   test: {
      //     name: {
      //       label: 'as-fixtrures',
      //       color: 'yellow'
      //     },

      //     include: ['test-fixtures/assembly/**/*.as.test.ts'],
      //     exclude: ['coverage-fixtures/**/*'],

      //     // bail: 5,
      //     retry: 1,
      //     testTimeout: 500,
      //     isolate: false,

      //     // v3
      //     pool: 'vitest-pool-assemblyscript',
      //     poolOptions: {
      //       assemblyScript: {
      //         debug: false,
      //         stripInline: true,
      //         coverageMemoryPagesMax: 2
      //       },
      //     },
      //   }
      // }),
    ]
  },
});

export default config;
