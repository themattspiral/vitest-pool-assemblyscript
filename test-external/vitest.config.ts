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
        // we're reporting on our crafted fixtures and fixture source for these external tests
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.ts'
      ],
      assemblyScriptExclude: [ '../vitest-pool-assemblyscript/test/assembly-src/**/*.external.ts' ],

      debugIstanbul: false,
    },

    projects: [
      defineProject({
        test: {
          name: {
            label: 'as-built',
            color: 'yellow'
          },

          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.as.test.ts',
          ],

          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,

            // we don't do internal instrumentation when we're external - save reporting on that for the local run
            _instrumentPoolInternals: false,

            wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
          }),
        }
      }),
    ]
  },
});
