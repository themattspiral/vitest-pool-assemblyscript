import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';
import { defineAssemblyScriptConfig, defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    globalSetup: [
      './test/generators/global-setup-large-fixture.js'
    ],

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
        'assembly/**/*.ts',                   // actual pool internals
        'test/assembly-src/**/*.ts',          // passing (100% coverage) test source (meta excluded)
        'test-generated/assembly-src/**/*.ts' // passing (100% coverage) generated test source (meta excluded)
      ],
      assemblyScriptExclude: [
        'test/assembly-src/**/*.meta*.ts',          // non-100% scenarios
        'test-generated/assembly-src/**/*.meta*.ts' // non-100% scenarios
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
            'test/js-coverage-parity/**/*',
          ]
        }
      }),

      defineProject({
        test: {
          name: { label: 'as-pool-passing', color: 'green' },
          include: [
            'test/assembly/**/*.test.ts',
            'test-generated/assembly/**/*.test.ts',       // generated tests
          ],
          exclude: [
            'test/assembly/**/*.meta*.test.ts',           // meta tests executed separately
            'test-generated/assembly/**/*.meta*.test.ts', // generated meta tests
          ],
          
          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            wasmImportsFactory: 'test/user-imports-factory/create-user-imports.js',
            extraCompilerFlags: ['--enable', 'simd'],

            // instrument our pool internals to get our own (usually excluded) coverage
            _instrumentPoolInternals: true,
          }),
        }
      }),

      // passing tests using the incremental runtime instead of default (stub)
      defineProject({
        test: {
          name: { label: 'as-pool-passing-incremental', color: 'green' },
          include: [
            'test/assembly/**/*.test.ts',
            'test-generated/assembly/**/*.test.ts',       // generated tests
          ],
          exclude: [
            'test/assembly/**/*.meta*.test.ts',
            'test-generated/assembly/**/*.meta*.test.ts',
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: 'test/user-imports-factory/create-user-imports.js',
            extraCompilerFlags: [
              '--enable', 'simd',
              '--runtime', 'incremental'
            ]
          }),
        }
      })
    ]
  },
});
