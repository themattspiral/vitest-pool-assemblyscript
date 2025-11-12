import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./project-js', './project-as'],

    // Global coverage configuration using hybrid provider
    coverage: {
      enabled: true,
      provider: 'custom',
      customProviderModule: './hybrid-coverage-provider.ts',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['**/*.ts', '**/*.as.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
});
