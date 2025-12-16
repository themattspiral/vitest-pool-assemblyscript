import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from './src/config/index.js';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    coverage: {
      enabled: false,
      reportOnFailure: true,
      reportsDirectory: 'coverage/',
      
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',

      // JS/TS sources to report coverage for
      include: [ 'src/**/*.{ts,js,mts,mjs}' ],
      
      // AS sources to report coverage for
      assemblyScriptInclude: [ 'assembly/**/*.ts' ]
    },

    projects: [
      // JavaScript/TypeScript tests (built-in pool)
      defineProject({
        test: {
          name: {
            label: 'ts-pool',
            color: 'blue'
          },

          include: [ 'test/**/*.test.ts' ],
          exclude: [ 'test/assembly/**/*' ]
        }
      }),

      // AssemblyScript tests (custom pool)
      defineAssemblyScriptProject({
        test: {
          name: {
            label: 'as-pool',
            color: 'yellow'
          },

          include: ['test/assembly/**/*.as.test.ts'],

          // Use AssemblyScript pool to execute tests in this project
          pool: 'vitest-pool-assemblyscript',
          poolOptions: {
            assemblyScript: {
              debug: false,
              stripInline: true,
            },
          },
        }
      })
    ]
  },
});
