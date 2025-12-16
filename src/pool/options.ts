import type { ResolvedConfig } from 'vitest/node';

import {
  AssemblyScriptPoolOptions,
  ASPoolOptionsFieldsWithDefaultValues,
  ResolvedAssemblyScriptPoolOptions,
  AS_POOL_FIELDS_WITH_DEFAULTS,
  AS_POOL_OPTIONAL_FIELDS
} from '../types/types.js';

/** Vitest config fields that have default values. Internally these will always be defined. */
// type ConfigFieldsWithDefaultValues = 'pool';

/**
 * Default values for built-in Vitest config options that are used by our pool
 *
 * Only includes fields we need to provide defaults for.
 */
// export const DEFAULT_CONFIG: Required<Pick<ResolvedConfig, ConfigFieldsWithDefaultValues>> = {
//   pool: 'vitest-pool-assemblyscript'
// };

const DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS: Required<Pick<AssemblyScriptPoolOptions, ASPoolOptionsFieldsWithDefaultValues>> = {
  debug: false,
  stripInline: true,
  coverageMemoryPagesMin: 1,
  coverageMemoryPagesMax: 4
};

/**
 * Get AssemblyScript pool options from resolved config
 *
 * Extracts and casts poolOptions.assemblyScript from config with proper typing.
 * Resolves to default values if not user-provided.
 *
 * @param config - Vitest resolved config
 * @returns AssemblyScript pool options
 */


export function getPoolOptions(config?: ResolvedConfig): ResolvedAssemblyScriptPoolOptions {
  const poolOptions: AssemblyScriptPoolOptions = config?.poolOptions?.assemblyScript ?? DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS;
  const allOptionsFields = [...AS_POOL_FIELDS_WITH_DEFAULTS, ...AS_POOL_OPTIONAL_FIELDS];

  for (const configKey of allOptionsFields) {
    // Use undefined check to preserve false boolean values, 0, etc
    if (poolOptions[configKey] === undefined) {
      // @ts-ignore
      poolOptions[configKey] = DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS[configKey]!;
    }
  }

  return poolOptions as ResolvedAssemblyScriptPoolOptions;
}
