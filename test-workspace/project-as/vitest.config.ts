import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'assemblyscript',
    pool: '../../dist/index.js',  // Use our real AS pool
    include: ['**/*.as.test.ts'],
    poolOptions: {
      assemblyScript: {
        debug: true,
      },
    },
  },
});
