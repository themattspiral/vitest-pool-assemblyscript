import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/pool-worker/index.ts',
    'src/config/index.ts',
    'src/coverage-provider/index.ts',
    'src/compiler/transforms/strip-inline.mts',
  ],
  format: ['esm'],
  outDir: 'dist', // Explicitly set output directory
  dts: true, // Generate .d.ts automatically
  clean: true,
  sourcemap: true,
  splitting: false,
  // Don't bundle dependencies - they should be installed by users
  external: [
    '@vitest/coverage-v8',
    '@vitest/runner',
    'assemblyscript',
    'binaryen',
    'birpc',
    'istanbul-lib-coverage',
    'node-addon-api',
    'source-map',
    'test-exclude',
    'tinypool',
    'vite-node',
    'vitest',
  ],
});
