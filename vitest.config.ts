import { defineConfig } from 'vitest/config';
import type {} from './dist/index.js'; // Import types to trigger module augmentation

export default defineConfig({
  test: {
    // Use our custom AssemblyScript pool (built version)
    pool: './dist/index.js',

    // Coverage configuration (master switch)
    coverage: {
      // DISABLED INTENTIONALLY so vitest won't explode until we can 
      // provide our coverage in the correct format (phase4i pending)
      enabled: false
    },

    // Pool-specific configuration
    poolOptions: {
      assemblyScript: {
        debug: false, // Enable verbose debug logging (default: false)
        debugTiming: false, // Enable detailed timing logs (default: false)
        stripInline: true, // Strip @inline decorators for coverage (default: true)
        coverageMode: 'failsafe', // Coverage collection mode (default: 'failsafe')

        // maxThreads: undefined, // Max worker threads (default: Math.max(cpus - 1, 1))
      }
    },

    // Worker isolation - use Vitest's standard config
    isolate: false, // Isolate workers per file (default: false - WASM instances already isolated)

    // Test file patterns
    include: ['tests/assembly/**/*.as.test.ts'],
    exclude: ['**/node_modules/**'],

    globals: false,
    environment: 'node',

    // Helpful for debugging
    reporters: ['verbose']
  },
});
