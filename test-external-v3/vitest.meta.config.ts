import { defineConfig, defineProject } from 'vitest/config';
import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/v3/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: [
      'json',
      'default'   // v3 default is closest to v4 verbose
    ],
    outputFile: { json: '.vitest-meta-json-output.json' },

    coverage: {
      enabled: true,
      reportOnFailure: true,
      reportsDirectory: 'coverage/meta/',
      provider: 'custom',
      customProviderModule: 'vitest-pool-assemblyscript/coverage',
      
      include: [
        '../vitest-pool-assemblyscript/test/js-example-meta-src'
      ],

      assemblyScriptInclude: [
        '../vitest-pool-assemblyscript/test/assembly-src/**/*.meta.ts'
      ],

      reporter: [
        ['text', {
          maxCols: 200,   // wide console for our CLI output verification
          skipFull: false // vitest forces skipFull: true on the text reporter in AI-agent environments
        }],
        ['html', {}],
        ['json', {}],
      ],

      debugIstanbul: false,
    },

    projects: [
      defineProject({
        test: {
          name: { label: 'ts-pool-meta-example', color: 'blue' },
          include: [
            '../vitest-pool-assemblyscript/test/js-example-meta/*.test.ts',
          ],
          exclude: [],
        }
      }),

      defineAssemblyScriptProject({
        test: {
          name: { label: 'as-pool-meta', color: 'yellow' },
          include: [
            '../vitest-pool-assemblyscript/test/assembly/**/*.meta.test.ts'
          ],
          pool: 'vitest-pool-assemblyscript/v3',
          poolOptions: {
            assemblyScript: {
              debug: false,
              debugNative: false,
              debugCoverageExtract: false,
              wasmImportsFactory: '../vitest-pool-assemblyscript/test/helpers/create-user-imports.js',
              extraCompilerFlags: ['--enable', 'simd'],
              _instrumentPoolInternals: false,
            }
          },
        }
      })
    ]
  },
});
