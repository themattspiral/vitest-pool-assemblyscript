import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    coverage: {
      enabled: true,
      reportOnFailure: true,
      reportsDirectory: 'coverage/meta-suite/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [ '!*' ],  // no js
      
      assemblyScriptInclude: [
        'test/assembly-src/**/*.meta.ts'
      ],

      debugIstanbul: false,
    },

    projects: [
      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: ['test/assembly/**/*.meta.test.ts'],
          
          pool: createAssemblyScriptPool({
            debug: false,
            debugNative: false,
            debugCoverageExtract: false,
            wasmImportsFactory: 'test/helpers/create-user-imports.js',
            _instrumentPoolInternals: false,
          }),
        }
      })
    ]
  },
});
