import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],
    
    globalSetup: './test/meta-verify/helpers/global-setup-capture-meta-run.ts',

    name: { label: 'ts-pool-meta-verify', color: 'blue' },
    include: [
      'test/meta-verify/**/*.test.ts',
    ],
    exclude: [],

    // meta verify tests only read the pre-generated meta run results file
    // and keep no mutable in-process state (vi stubs, no global/env writes),
    // so reusing workers across files can't leak state between them.
    // This avoids the per-file worker-spawn cost (vitest's isolate diagnostic 
    // estimates ~1-2s savings)
    isolate: false,
  },
});
