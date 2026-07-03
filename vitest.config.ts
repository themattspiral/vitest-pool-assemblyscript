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
      reportsDirectory: 'coverage/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [
        'src/**/*.{ts,js,mts,mjs}',
      ],
      exclude: [
        'src/index*.ts',
        'src/config/',
        'src/types/',
      ],
      
      assemblyScriptInclude: [
        'test/assembly-src/coverage-collection/pass-100/**/*.ts', // the crafted 100% passing set (feature/shared source excluded)
        'test-generated/assembly-src/**/*.ts',                    // generated large fixture (100% coverage)
        'assembly/**/*.ts',                                       // pool internals instrumented for local visibility
      ],
      assemblyScriptExclude: [
        'assembly/index.ts',
        'test/assembly-src/**/*.meta*.ts',          // non-100% scenarios
        'test-generated/assembly-src/**/*.meta*.ts' // non-100% scenarios
      ],

      debugIstanbul: false,

      // Local gate on JUST the crafted pass-100 source — a fast-feedback tripwire for
      // statement/branch/line/function regressions in the deliberate set
      thresholds: {
        perFile: true,
        'test/assembly-src/coverage-collection/pass-100/**': {
          functions: 100,
          statements: 100,
          branches: 100,
          lines: 100,
        },
      },
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
            'test/meta-verify/**/*',          // meta-verify executed separately
            'test/js-coverage-parity/**/*',   // meta-verify coverage parity oracle
          ],
        },
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
