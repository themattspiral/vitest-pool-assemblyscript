import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    reporters: ['verbose'],
    
    name: { label: 'ts-pool-meta-verify', color: 'blue' },
    include: [
      'test/meta-verify/*.test.ts',
    ],
    exclude: [],
  },
});
