import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    name: {
      label: 'as-passing-suite',
      color: 'green'
    },

    include: [
      '../vitest-pool-assemblyscript/test/assembly/**/*.test.ts',
    ],
    exclude: [
      '../vitest-pool-assemblyscript/test/assembly/**/*.external.test.ts',
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
      assemblyScriptExclude: [ '../vitest-pool-assemblyscript/test/assembly-src/**/*.external.ts' ],

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

      // we don't do internal instrumentation when we're running externally
      _instrumentPoolInternals: false,

      wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
    }),
  },
});
