import { defineConfig, TestProjectInlineConfiguration } from 'vitest/config';
import type {} from './dist/index.js'; // Import types to trigger module augmentationm - update to vitest-pool-assemblyscript

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',

    // Helpful for debugging
    reporters: ['verbose'],

    // Coverage configuration (must be global in vitest)
    coverage: {
      // DISABLED INTENTIONALLY so vitest won't explode until we can
      // provide our coverage in the correct format (hybrid provider pending)
      enabled: false,
      
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript',

      // Include only AS source files in coverage reports
      // note: test.includes files are auto-excluded from coverage by Vitest
      include: ['src/*.ts', 'test-examples/assembly-src/**/*.ts'],
    },

    projects: [
      {
        test: {
          // JavaScript/TypeScript tests (built-in pool)
          name: {
            label: 'typescript-example-tests',
            color: 'blue'
          },

          // pool: 'threads',  // or 'forks', 'vmThreads'
          include: ['test-examples/js/*.test.ts'],
          exclude: ['**/node_modules/**'],

          // Per-project test execution settings
          // testTimeout: 5000,
          // retry: 0,
          // bail: undefined,
          // isolate: true,
          // poolOptions: {
          //   threads: {
          //     // execArgv: ['--enable-source-maps'],
          //   },
          // }
        }
      },
      {
        test: {
          name: {
            label: 'assemblyscript-example-tests',
            color: 'yellow'
          },
          
          include: ['test-examples/assembly/**/*.as.test.ts'],

          // Use our custom AssemblyScript pool (built version)
          pool: './dist/index.js',
          
          // Pool-specific configuration
          poolOptions: {
            assemblyScript: {
              debug: false,             // Enable verbose debug logging (default: false)
              stripInline: true,        // Strip @inline decorators for coverage (default: true)
              coverageMode: 'failsafe', // Coverage collection mode (default: 'failsafe')

              // maxThreads: undefined, // Max worker threads (default: Math.max(cpus - 1, 1))
            },
            
          },
        }
      }
    ]
  },
});
