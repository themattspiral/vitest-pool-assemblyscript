import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use our custom AssemblyScript pool
    pool: './src/index.ts',

    // Pool-specific configuration
    poolOptions: {
      assemblyScript: {
        debug: true, // Enable verbose debug logging
        /**
         * Coverage mode:
         * - false: No coverage (fast, accurate errors) - Use for rapid TDD
         * - true: Coverage only (fast, broken errors on failure) - Use for CI when tests pass
         * - 'dual': Both coverage AND accurate errors (slower, 2x) - Use for debugging failures with coverage
         *
         * Default: 'dual' (prioritizes correctness over speed)
         */
        coverage: 'dual',
        /**
         * Strip @inline decorators for better coverage accuracy
         * - true (default): @inline decorators removed, functions visible in coverage
         * - false: @inline functions are inlined, missing from coverage
         *
         * Trade-offs: Complete coverage, slightly slower execution
         * Only applies when coverage is enabled.
         */
        stripInline: false,
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
