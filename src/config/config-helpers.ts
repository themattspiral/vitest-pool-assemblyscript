/**
 * Configuration helpers for vitest-pool-assemblyscript
 *
 * Provides custom type-safe config helpers similar to Cloudflare's vitest-pool-workers
 * to work around TypeScript's ProjectConfig poolOptions type narrowing in Vitest v3.
 */

import type { ViteUserConfig, UserWorkspaceConfig, ConfigEnv } from 'vitest/config';
import { BaseCoverageOptions } from 'vitest/node';
import type { AssemblyScriptPoolOptions } from '../types.js';

/**
 * Type for config that may be a value, Promise, or function
 */
type AnyConfigExport<T extends ViteUserConfig> =
  | T
  | Promise<T>
  | ((env: ConfigEnv) => T | Promise<T>);

/**
 * Module augmentation for CustomProviderOptions
 *
 * Vitest v3's CustomProviderOptions only includes fields with default values,
 * but users should be able to configure all optional fields from BaseCoverageOptions.
 * This augmentation adds the missing optional fields that work at runtime but
 * aren't typed in vitest v3.
 *
 * Additionally, we add AssemblyScript-specific coverage fields that our hybrid
 * coverage provider uses to glob AS source files separately from JS sources.
 *
 * By placing this augmentation here, it automatically loads when users import
 * our config helpers, providing proper coverage typing alongside pool typing.
 */
declare module 'vitest/node' {
  interface CustomProviderOptions extends BaseCoverageOptions {
    /**
     * Glob patterns for AssemblyScript source files to include in coverage.
     * Used by pool's hybrid coverage provider to build the complete AS coverage map.
     *
     * The standard `include` patterns are used by the v8 provider for JS/TS files.
     *
     * @example ['assembly/**\/*.as.ts']
     */
    assemblyScriptInclude?: string[];

    /**
     * Glob patterns for AssemblyScript files to exclude from coverage.
     *
     * @example ['**\/*.as.test.ts']
     */
    assemblyScriptExclude?: string[];
  }
}

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
    pool?: string;
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
 *     pool: 'vitest-pool-assemblyscript',
 *     include: ['test/assembly/**‍/*.as.test.ts'], // example
 *     poolOptions: {
 *       assemblyScript: {
 *         stripInline: false, // example
 *         maxThreads: 15,     // example
 *       },
 *     },
 *     coverage: {
 *       provider: 'custom',
 *       customProviderModule: 'vitest-pool-assemblyscript/coverage',
 *       include: ['src/**‍/*.ts'],  // example JS/TS sources (v8 provider)
 *       assemblyScriptInclude: ['assembly/**‍/*.ts'],  // example AS sources (pool's hybrid provider)
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
 *         // ... extend default pool, or
 *         // define any other project config(s) ...
 *         test: {
 *           name: { label: 'typescript-unit-tests', color: 'blue' }, // example
 *         }
 *       }),
 *       defineAssemblyScriptProject({
 *         test: {
 *           name: { label: 'assemblyscript-unit-tests', color: 'yellow' }, // example
 *           pool: 'vitest-pool-assemblyscript',
 *           include: ['test/assembly/**‍/*.as.test.ts'], // example
 *           poolOptions: {
 *             assemblyScript: {
 *               stripInline: false, // example
 *               maxThreads: 15,     // example
 *             },
 *           },
 *         },
 *       }),
 *     ],
 *     coverage: {    // coverage section is global only in vitest
 *       provider: 'custom',
 *       customProviderModule: 'vitest-pool-assemblyscript/coverage',
 *       include: ['src/**‍/*.ts'],  // example JS/TS sources (v8 provider)
 *       assemblyScriptInclude: ['assembly/**‍/*.ts'],  // example AS sources (pool's hybrid provider)
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
