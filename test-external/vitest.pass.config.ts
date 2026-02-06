import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    name: { label: 'as-pool-passing', color: 'green' },

    include: [
      '../vitest-pool-assemblyscript/test/assembly/**/*.test.ts',
    ],
    exclude: [
      '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts',
    ],

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
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta.ts'
      ],

      debugIstanbul: false,

      // we're reporting on our passing fixtures so these are all expected to be 100%
      thresholds: {
        functions: 100,
        perFile: true
      }
    },

    pool: createAssemblyScriptPool({
      debug: false,
      debugNative: false,
      debugCoverageExtract: false,
      wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
    }),
  },
});
