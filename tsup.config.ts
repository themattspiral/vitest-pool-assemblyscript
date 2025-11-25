import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'fs';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/pool-worker/index.ts',
    'src/config/index.ts',
    'src/coverage-provider/index.ts',
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
    'typescript',
    'vite-node',
    'vitest',
  ],
  onSuccess: async () => {
    // Copy transform files to dist
    mkdirSync('dist/compiler-transforms', { recursive: true });
    copyFileSync('src/compiler/transforms/strip-inline.mjs', 'dist/compiler-transforms/strip-inline.mjs');
    copyFileSync('src/compiler/transforms/extract-function-metadata.mjs', 'dist/compiler-transforms/extract-function-metadata.mjs');
  },
});
