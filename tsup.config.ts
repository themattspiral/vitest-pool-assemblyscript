import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'fs';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/worker/index.ts',
    'src/config/config-helpers.ts',
    'src/coverage-utils/index.ts',
  ],
  format: ['esm'],
  outDir: 'dist', // Explicitly set output directory
  dts: true, // Generate .d.ts automatically
  clean: true,
  sourcemap: true,
  splitting: false,
  // Don't bundle dependencies - they should be installed by users
  external: [
    'vitest',
    '@vitest/coverage-v8',
    '@vitest/runner',
    'assemblyscript',
    'binaryen',
    'birpc',
    'source-map',
    'tinypool',
    'vite-node',
    'istanbul-lib-coverage'
  ],
  onSuccess: async () => {
    // Copy transform files to dist
    mkdirSync('dist/transforms', { recursive: true });
    copyFileSync('src/transforms/strip-inline.mjs', 'dist/transforms/strip-inline.mjs');
    copyFileSync('src/transforms/extract-function-metadata.mjs', 'dist/transforms/extract-function-metadata.mjs');
  },
});
