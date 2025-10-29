import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use our custom AssemblyScript pool (built version)
    pool: './dist/index.js',

    // Pool-specific configuration
    poolOptions: {
      assemblyScript: {
        debug: false, // Enable verbose debug logging
        debugTiming: false, // Enable detailed timing logs for performance analysis
        /**
         * Coverage collection mode:
         * - 'failsafe': Smart re-run - instrumented first, re-run failures on clean (default, optimal)
         * - 'dual': Always dual - both instrumented + clean for all tests (slower, always accurate)
         * - 'integrated': Single run - instrumented only (fast, broken error locations on failure)
         */
        coverageMode: 'failsafe',
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

    // Helpful for debugging
    reporters: ['verbose']
  },
});
