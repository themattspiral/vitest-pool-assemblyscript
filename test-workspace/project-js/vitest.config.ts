import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'javascript',
    pool: 'threads',  // Use standard threads pool for JS tests
    include: ['**/*.spec.ts'],
  },
});
