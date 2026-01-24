/**
 * Configuration helpers for vitest-pool-assemblyscript
 *
 * Provides custom type-safe config helpers similar to Cloudflare's vitest-pool-workers
 * to work around TypeScript's ProjectConfig poolOptions type narrowing in Vitest v3.
 */

import type { ViteUserConfig, UserWorkspaceConfig, ConfigEnv } from 'vitest/config';

import type { AssemblyScriptPoolOptions } from '../types/types.js';

/**
 * Type for config that may be a value, Promise, or function
 */
type AnyConfigExport<T extends ViteUserConfig> =
  | T
  | Promise<T>
  | ((env: ConfigEnv) => T | Promise<T>);

/**
 * AssemblyScript pool configuration with proper typing for poolOptions
 *
 * Use this type with `defineAssemblyScriptConfig` for root-level configs,
 * or `defineAssemblyScriptProject` for project-level configs.
 * 
 * Vitest v3's ProjectConfig narrows poolOptions as an inline object type,
 * which cannot be augmented via TypeScript module augmentation. Config helpers
 * use type intersection to add poolOptions.assemblyScript typing.
 *
 * Note: Coverage is NOT included here because it's global-only config in Vitest.
 * Coverage typing comes from the CustomProviderOptions augmentation above.
 */
export type AssemblyScriptUserConfig<T extends ViteUserConfig> = T & {
  test?: {
    // pool?: string;
    poolOptions?: {
      assemblyScript?: AssemblyScriptPoolOptions;
    };
  };
};

/**
 * Root-level config type with AssemblyScript pool support
 */
export type AssemblyScriptConfigExport = AssemblyScriptUserConfig<ViteUserConfig>;

/**
 * Project-level config type with AssemblyScript pool support
 */
export type AssemblyScriptProjectConfigExport = AssemblyScriptUserConfig<UserWorkspaceConfig>;

/**
 * Define a root-level Vitest config with AssemblyScript pool options.
 *
 * This is a type-safe wrapper that properly types `poolOptions.assemblyScript`
 * for both root and project-level configurations.
 *
 * @example
 * ```ts
 * import { defineAssemblyScriptConfig } from 'vitest-pool-assemblyscript/config';
 *
 * export default defineAssemblyScriptConfig({
 *   test: {
 *     name: 'assemblyscript-unit-tests',
 *     pool: 'vitest-pool-assemblyscript',
 *     include: ['test/assembly/**‍/*.as.test.ts'], // example
 *     poolOptions: {
 *       assemblyScript: { // optional },
 *     },
 *     coverage: {
 *       provider: 'custom',
 *       customProviderModule: 'vitest-pool-assemblyscript/coverage',
 *       include: ['src/**‍/*.ts'],  // example JS/TS sources (v8 provider)
 *       assemblyScriptInclude: ['assembly/**‍/*.ts'],  // example AS sources
 *       assemblyScriptExclude: ['**‍/*.as.test.ts'],   // exclude AS test files
 *     },
 *   },
 * });
 * ```
 */
export function defineAssemblyScriptConfig(
  config: AssemblyScriptConfigExport
): AssemblyScriptConfigExport;
export function defineAssemblyScriptConfig(
  config: Promise<AssemblyScriptConfigExport>
): Promise<AssemblyScriptConfigExport>;
export function defineAssemblyScriptConfig(
  config: (env: ConfigEnv) => AssemblyScriptConfigExport | Promise<AssemblyScriptConfigExport>
): (env: ConfigEnv) => AssemblyScriptConfigExport | Promise<AssemblyScriptConfigExport>;
export function defineAssemblyScriptConfig(
  config: AnyConfigExport<AssemblyScriptConfigExport>
): AnyConfigExport<AssemblyScriptConfigExport> {
  // Pass through - this is just for type safety
  return config;
}

/**
 * Define a project-level Vitest config with AssemblyScript pool options.
 *
 * Use this when defining AssemblyScript test projects within a workspace.
 *
 * @example
 * ```ts
 * import { defineConfig, defineProject } from 'vitest/config';
 * import { defineAssemblyScriptProject } from 'vitest-pool-assemblyscript/config';
 *
 * export default defineConfig({
 *   test: {
 *     projects: [
 *       defineProject({
 *         test: {
 *           name: { label: 'typescript-unit-tests', color: 'blue' },
 *         }
 *       }),
 *       defineAssemblyScriptProject({
 *         test: {
 *           name: { label: 'assemblyscript-unit-tests', color: 'yellow' },
 *           pool: 'vitest-pool-assemblyscript',
 *           include: ['test/assembly/**‍/*.as.test.ts'], // example
 *           poolOptions: {
 *             assemblyScript: { // optional },
 *           },
 *         },
 *       }),
 *     ],
 *     coverage: {    // coverage section is global only in vitest
 *       provider: 'custom',
 *       customProviderModule: 'vitest-pool-assemblyscript/coverage',
 *       include: ['src/**‍/*.ts'],  // example JS/TS sources (v8 provider)
 *       assemblyScriptInclude: ['assembly/**‍/*.ts'],  // example AS sources
 *       assemblyScriptExclude: ['**‍/*.as.test.ts'],   // exclude AS test files
 *     },
 *   },
 * });
 * ```
 */
export function defineAssemblyScriptProject(
  config: AssemblyScriptProjectConfigExport
): AssemblyScriptProjectConfigExport;
export function defineAssemblyScriptProject(
  config: Promise<AssemblyScriptProjectConfigExport>
): Promise<AssemblyScriptProjectConfigExport>;
export function defineAssemblyScriptProject(
  config: (env: ConfigEnv) => AssemblyScriptProjectConfigExport | Promise<AssemblyScriptProjectConfigExport>
): (env: ConfigEnv) => AssemblyScriptProjectConfigExport | Promise<AssemblyScriptProjectConfigExport>;
export function defineAssemblyScriptProject(
  config: AnyConfigExport<AssemblyScriptProjectConfigExport>
): AnyConfigExport<AssemblyScriptProjectConfigExport> {
  // Pass through - this is just for type safety
  return config;
}
