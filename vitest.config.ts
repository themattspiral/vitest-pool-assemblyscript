import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from './src/config/config-helpers.js';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',

    // Helpful for debugging
    reporters: ['verbose'],

    // Coverage configuration (must be global in vitest)
    coverage: {
      enabled: true,
      reportOnFailure: true,
      
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',

      // JS/TS sources to report coverage for
      include: [ 'test-examples/js-src/*.ts' ],
      
      // AS sources to report coverage for
      assemblyScriptInclude: [
        'test-examples/assembly-src/**/*.ts'
      ]
    },

    projects: [
      // JavaScript/TypeScript tests (built-in pool)
      defineProject({
        test: {
          name: {
            label: 'typescript-example-tests',
            color: 'blue'
          },

          include: ['test-examples/js/*.test.ts'],
          exclude: ['**/node_modules/**'],
          
          testTimeout: 5000,
          // retry: 1,
          // bail: 1,

          // pool: 'threads',  // or 'forks', 'vmThreads'
          // poolOptions: {
          //   threads: {
          //     // execArgv: ['--enable-source-maps'],
          //   },
          // }
        }
      }),

      // AssemblyScript tests (custom pool)
      defineAssemblyScriptProject({
        test: {
          name: {
            label: 'assemblyscript-example-tests',
            color: 'yellow'
          },

          include: ['test-examples/assembly/**/*.as.test.ts'],

          // testTimeout: 7000,
          // retry: 1,
          // bail: 5,

          // Use AssemblyScript pool to execute tests in this project (dist version for dev)
          pool: './dist/index.js',
          poolOptions: {
            assemblyScript: {
              debug: false,
              stripInline: true,
              coverageMode: 'failsafe',
              // maxThreads: undefined,
            },
          },
        }
      }),
    ]
  },
});
