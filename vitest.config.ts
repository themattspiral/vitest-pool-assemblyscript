import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    coverage: {
      enabled: true,
      reportOnFailure: true,
      reportsDirectory: 'coverage/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      // include: [ 'src/**/*.{ts,js,mts,mjs}' ],
      include: [ '!*' ],
      assemblyScriptInclude: [ 'assembly/**/*.ts' ],

      debugIstanbul: false,
    },

    projects: [
      defineProject({
        test: {
          name: { label: 'ts-pool', color: 'blue' },
          include: [ 'test/**/*.test.ts' ],
          exclude: [ 'test/assembly/**/*' ]
        }
      }),

      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool', color: 'yellow' },
          include: ['test/assembly/**/*.test.ts'],
          exclude: ['test/assembly/**/*.external.test.ts'],
          
          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            _instrumentPoolInternals: true,
            wasmImportsFactory: 'test/helpers/create-user-imports.js',
          }),
        }
      })
    ]
  },
});
