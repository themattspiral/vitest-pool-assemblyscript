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
      
      include: [ '!*' ],
      assemblyScriptInclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.ts'
      ],

      debugIstanbul: false,
    },

    projects: [
      defineProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },

          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts',
          ],

          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
          }),
        }
      }),
      
      defineProject({
        test: {
          name: { label: 'as-pool-passing', color: 'green' },

          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.test.ts',
          ],
          exclude: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts',
          ],

          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
          }),
        }
      }),
    ]
  },
});
