import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use our custom AssemblyScript pool
    pool: './src/index.ts',

    // Pool-specific configuration
    poolOptions: {
      assemblyScript: {
        debug: true, // Enable verbose debug logging
      }
    },

    // Test file patterns
    include: ['tests/assembly/**/*.as.test.ts'],
    exclude: ['**/node_modules/**'],

    globals: false,
    environment: 'node',

    // Parallel execution (pools handle this)
    threads: true,

    // Helpful for debugging
    reporters: ['verbose'],
  },
});
