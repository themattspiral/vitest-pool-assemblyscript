import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use our custom AssemblyScript pool
    pool: './src/pool.ts',

    // Pool-specific configuration
    poolOptions: {
      assemblyScript: {
        // Future: Add AS-specific options here
      }
    },

    // Test file patterns
    include: ['tests/**/*.as.test.ts'],
    exclude: ['**/node_modules/**'],

    globals: false,
    environment: 'node',

    // Parallel execution (pools handle this)
    threads: true,

    // Helpful for debugging
    reporters: ['verbose'],
  },
});
