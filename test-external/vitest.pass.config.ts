import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    globalSetup: [
      '../vitest-pool-assemblyscript/test/generators/global-setup-large-fixture.js'
    ],

    coverage: {
      enabled: true,
      reportsDirectory: 'coverage/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [ '!*' ],
      assemblyScriptInclude: [
        // scoped to the crafted 100% set (feature/shared source excluded)
        '../vitest-pool-assemblyscript/test/assembly-src/coverage-collection/pass-100/**/*.ts',
        '../vitest-pool-assemblyscript/test-generated/assembly-src/**/*.ts'
      ],
      assemblyScriptExclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta*.ts',
        '../vitest-pool-assemblyscript/test-generated/assembly-src/**/*.meta*.ts'
      ],

      debugIstanbul: false,

      // the crafted pass-100 set + the generated fixture are 100% on all four types
      thresholds: {
        functions: 100,
        statements: 100,
        branches: 100,
        lines: 100,
        perFile: true
      }
    },

    projects: [
      defineProject({
        test: {
          name: { label: 'ts-pool', color: 'blue' },
          include: [
            '../vitest-pool-assemblyscript/test/**/*.test.ts',
          ],
          exclude: [
            '../vitest-pool-assemblyscript/test/assembly/**/*',
            '../vitest-pool-assemblyscript/test/meta-verify/**/*',          // meta-verify executed separately
            '../vitest-pool-assemblyscript/test/js-coverage-parity/**/*',   // meta-verify coverage parity oracle
            '../vitest-pool-assemblyscript/test/pool-unit/instrumentation/dynamic-fixture-validation.test.ts',
          ],
        },
      }),

      defineProject({
        test: {
          name: { label: 'dynamic-fixture-validation', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/pool-unit/instrumentation/dynamic-fixture-validation.test.ts',
          ],
        }
      }),

      defineProject({
        test: {
          name: { label: 'as-pool-passing', color: 'green' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.test.ts',
            '../vitest-pool-assemblyscript/test-generated/assembly/**/*.test.ts',
          ],
          exclude: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta*.test.ts',
            '../vitest-pool-assemblyscript/test-generated/assembly/**/*.meta*.test.ts',
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/create-user-imports.js',
            extraCompilerFlags: ['--enable', 'simd'],
          }),
        }
      }),
      
      // passing tests using the incremental runtime instead of default (stub)
      defineProject({
        test: {
          name: { label: 'as-pool-passing-incremental', color: 'green' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.test.ts',
            '../vitest-pool-assemblyscript/test-generated/assembly/**/*.test.ts',
          ],
          exclude: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta*.test.ts',
            '../vitest-pool-assemblyscript/test-generated/assembly/**/*.meta*.test.ts',
          ],
          pool: createAssemblyScriptPool({
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/create-user-imports.js',
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
