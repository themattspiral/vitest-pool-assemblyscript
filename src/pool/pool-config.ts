import type { ResolvedConfig } from 'vitest/node';

import {
  AssemblyScriptPoolOptions,
  ASPoolOptionsFieldsWithDefaultValues,
  ResolvedAssemblyScriptPoolOptions,
  AS_POOL_FIELDS_WITH_DEFAULTS,
  AssemblyScriptResolvedConfig
} from '../types/types.js';
import { createPoolError } from '../util/pool-errors.js';
import { POOL_ERROR_NAMES } from '../types/constants.js';

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
} as const;

/**
 * Get AssemblyScript pool options from user-provided pool options
 */
export function resolvePoolOptions(userPoolOptions?: AssemblyScriptPoolOptions): ResolvedAssemblyScriptPoolOptions {
  const poolOptions: AssemblyScriptPoolOptions = userPoolOptions ?? DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS;

  // resolve fields with defaults if user hasn't provided them
  for (const configKey of AS_POOL_FIELDS_WITH_DEFAULTS) {
    if (poolOptions[configKey] === undefined) {
      poolOptions[configKey] = DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS[configKey] as any;
    }
  }

  const resolved = { ...poolOptions, isResolved: true } as ResolvedAssemblyScriptPoolOptions;

  if (resolved.coverageMemoryPagesMin < 1 || resolved.coverageMemoryPagesMax < 1) {
    throw createPoolError(
      `Coverage memory page size options must be positive - coverageMemoryPagesMin: ${resolved.coverageMemoryPagesMin}`
      + ` | coverageMemoryPagesMax: ${resolved.coverageMemoryPagesMax}`,
      POOL_ERROR_NAMES.PoolConfigError
    );
  }

  return resolved;
}

/**
 * Get AssemblyScript pool options from resolved config (vitest v3)
 *
 * Extracts and casts poolOptions.assemblyScript from config with proper typing.
 * Resolves to default values if not user-provided.
 */
export function getResolvedPoolOptions(_config?: ResolvedConfig): ResolvedAssemblyScriptPoolOptions {
  // const poolOptions: AssemblyScriptPoolOptions = config?.poolOptions?.assemblyScript ?? DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS;
  const poolOptions: AssemblyScriptPoolOptions = DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS;

  // resolve fields with defaults if user hasn't provided them
  for (const configKey of AS_POOL_FIELDS_WITH_DEFAULTS) {
    if (poolOptions[configKey] === undefined) {
      poolOptions[configKey] = DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS[configKey] as any;
    }
  }

  const resolved = {
    ...poolOptions,
    isResolved: true
  } as ResolvedAssemblyScriptPoolOptions;

  if (resolved.coverageMemoryPagesMin < 1 || resolved.coverageMemoryPagesMax < 1) {
    throw createPoolError(
      `Coverage memory page size options must be positive - coverageMemoryPagesMin: ${resolved.coverageMemoryPagesMin}`
      + ` | coverageMemoryPagesMax: ${resolved.coverageMemoryPagesMax}`,
      POOL_ERROR_NAMES.PoolConfigError
    );
  }

  return resolved;
}

export function getResolvedAssemblyScriptConfig(globalConfig: ResolvedConfig, projectConfig: ResolvedConfig): AssemblyScriptResolvedConfig {
  const mergedConfig: AssemblyScriptResolvedConfig = {
    ...globalConfig,
    poolOptions: {
      assemblyScript: getResolvedPoolOptions(projectConfig)
    }
  };

  // merge defined project config options into global for a unified config
  for (const [prop, projectVal] of Object.entries(projectConfig)) {
    if (projectVal !== undefined && prop !== 'poolOptions') {
      const key = prop as keyof AssemblyScriptResolvedConfig;
      
      // @ts-ignore
      mergedConfig[key] = projectVal;
    }
  }

  return mergedConfig;
}
