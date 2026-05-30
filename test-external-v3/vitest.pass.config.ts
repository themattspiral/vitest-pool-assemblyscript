import { defineAssemblyScriptConfig, defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineAssemblyScriptConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    coverage: {
      enabled: true,
      reportsDirectory: 'coverage/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [ '!*' ],
      assemblyScriptInclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.ts'
      ],
      assemblyScriptExclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta*.ts'
      ],

      debugIstanbul: false,

      // we're reporting on our passing fixtures so these are all expected to be 100%
      thresholds: {
        functions: 100,
        perFile: true
      }
    },

    projects: [
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-passing-incremental', color: 'green' },
          include: [ '../vitest-pool-assemblyscript/test/assembly/**/*.test.ts' ],
          exclude: [ '../vitest-pool-assemblyscript/test/assembly/**/*.meta*.test.ts' ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
              extraCompilerFlags: ['--enable', 'simd'],
            }
          },
        }
      }),
      
      // passing tests using the incremental runtime instead of default (stub)
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-passing', color: 'green' },
          include: [ '../vitest-pool-assemblyscript/test/assembly/**/*.test.ts' ],
          exclude: [ '../vitest-pool-assemblyscript/test/assembly/**/*.meta*.test.ts' ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
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
