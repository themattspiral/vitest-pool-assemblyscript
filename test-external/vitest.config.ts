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
      
      // include: [ 'src/**/*.{ts,js,mts,mjs}' ],
      include: [ '!*' ],
      assemblyScriptInclude: [
        '../assembly/**/*.ts',
        '../test/assembly-src/**/*.ts'
      ],
      assemblyScriptExclude: [ '../test/assembly-src/**/*.external.ts' ],

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
            '../test/assembly/**/*.as.test.ts',
          ],

          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            _instrumentPoolInternals: true,
            wasmImportsFactory: '../test/helpers/create-user-imports.js',
          }),
        }
      }),
    ]
  },
});
