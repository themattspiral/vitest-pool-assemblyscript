import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/pool-worker/index.ts',
    'src/config/index.ts',
    'src/coverage-provider/index.ts',
    'src/compiler/transforms/strip-inline.mts',
  ],
  format: 'es',
  outDir: 'dist',
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    // prod/runtime deps
    'birpc',
    'node-addon-api',
    'source-map',
    'test-exclude',
    'tinypool',
    'tinyrainbow',

    // peer deps
    '@vitest/coverage-v8',
    '@vitest/runner',
    'assemblyscript',
    'istanbul-lib-coverage',
    'vite-node',
    'vitest',
  ]
});
