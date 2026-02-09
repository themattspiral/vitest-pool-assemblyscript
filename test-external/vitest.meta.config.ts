import { defineConfig, defineProject } from 'vitest/config';
import { createAssemblyScriptPool } from 'vitest-pool-assemblyscript/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],

    name: { label: 'as-pool-meta', color: 'yellow' },

    include: [
      '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts',
    ],

    coverage: {
      enabled: true,
      reportOnFailure: true,
      reportsDirectory: 'coverage/meta/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [ '!*' ],
      assemblyScriptInclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta.ts'
      ],

      debugIstanbul: false,
    },

    pool: createAssemblyScriptPool({
      debug: false,
      debugNative: false,
      debugCoverageExtract: false,
      wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
    }),
  },
});
