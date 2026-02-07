import { defineConfig } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

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

    name: { label: 'as-pool-meta', color: 'yellow' },
    
    include: ['test/assembly/**/*.meta.test.ts'],
    
    pool: createAssemblyScriptPool({
      debug: false,
      debugNative: false,
      debugCoverageExtract: false,
      wasmImportsFactory: 'test/helpers/create-user-imports.js',
      _instrumentPoolInternals: false,
    }),
  },
});
