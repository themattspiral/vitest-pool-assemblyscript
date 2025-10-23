import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/worker/index.ts'
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
    '@vitest/runner',
    'assemblyscript',
    'binaryen',
    'source-map',
    'tinypool',
  ],
});
