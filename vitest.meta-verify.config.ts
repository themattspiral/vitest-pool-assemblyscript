import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],
    
    globalSetup: './test/meta-verify/global-setup-capture-meta-run.ts',

    name: { label: 'ts-pool-meta-verify', color: 'blue' },
    include: [
      'test/meta-verify/**/*.test.ts',
    ],
    exclude: [],
  },
});
