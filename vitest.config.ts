import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';
import { defineAssemblyScriptConfig, defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

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
      
      include: [
        '!*',
        // 'src/**/*.{ts,js,mts,mjs}',
        // 'test/js-example-src/**/*.ts',
      ],
      exclude: [],
      
      assemblyScriptInclude: [
        'assembly/**/*.ts',         // actual pool internals
        'test/assembly-src/**/*.ts' // passing (100% coverage) test source (meta excluded) 
      ],
      assemblyScriptExclude: [
        'test/assembly-src/**/*.meta.ts' // non-100% scenarios
      ],

      debugIstanbul: false,
    },

    projects: [
      defineProject({
        test: {
          name: { label: 'ts-pool', color: 'blue' },
          include: [
            'test/**/*.test.ts',
          ],
          exclude: [
            'test/assembly/**/*',
            'test/meta-verify/**/*',  // meta-verify executed separately
            'test/js-example-meta/**/*',
          ]
        }
      }),

      defineProject({
        test: {
          name: { label: 'as-pool-passing', color: 'green' },
          include: ['test/assembly/**/*.test.ts'],
          exclude: ['test/assembly/**/*.meta.test.ts'],   // meta tests executed separately
          
          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            wasmImportsFactory: 'test/helpers/create-user-imports.js',

            // instrument our pool internals to get our own (usually excluded) coverage
            _instrumentPoolInternals: true,
          }),
        }
      })
    ]
  },
});
