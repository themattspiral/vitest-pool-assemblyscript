import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/pool-thread/worker-thread.ts',
    'src/pool-thread/v3/tinypool-thread.ts',
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
    'semver',
    'source-map',
    'test-exclude',
    'tinypool',
    'tinyrainbow',

    // peer deps
    '@vitest/coverage-v8',
    '@vitest/runner',
    '@vitest/utils',
    'assemblyscript',
    'istanbul-lib-coverage',
    'vitest',

    // peer dep sub-exports that get bundled otherwise
    '@vitest/runner/utils',
    '@vitest/utils/diff',
    '@vitest/utils/highlight',

    // these aren't needed apparently, but be cautious and keep
    'assemblyscript/asc',
    'assemblyscript/transform',
    'vitest/config',
    'vitest/node',
    'vitest/worker',
  ]
});
