import { defineProject } from 'vitest/config';
import { defineAssemblyScriptConfig, defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineAssemblyScriptConfig({
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
      experimentalAstAwareRemapping: true,
      
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
          ],

          // force it to run separately from AS projects (sequentially).
          // this is a necessary v3 exception because it executes all ProcessPools concurrently
          sequence: { groupOrder: 1 },
        },
      }),

      defineAssemblyScriptProject({
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
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/create-user-imports.js',
              extraCompilerFlags: ['--enable', 'simd'],
            }
          },
        }
      }),
      
      // passing tests using the incremental runtime instead of default (stub)
      defineAssemblyScriptProject({
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
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/user-imports-factory/create-user-imports.js',
              extraCompilerFlags: [
                '--enable', 'simd',
                '--runtime', 'incremental'
              ],
            }
          },
        }
      })
    ]
  },
});
