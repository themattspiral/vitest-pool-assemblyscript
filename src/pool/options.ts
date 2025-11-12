import type { ResolvedConfig } from 'vitest/node';

import {
  AssemblyScriptPoolOptions,
  ASPoolOptionsFieldsWithDefaultValues,
  ResolvedAssemblyScriptPoolOptions,
  CoverageModeFlags,
  AS_POOL_FIELDS_WITH_DEFAULTS,
  AS_POOL_OPTIONAL_FIELDS
} from '../types.js';
import { COVERAGE_MODES } from '../types.js';

/** Vitest config fields that have default values. Internally these will always be defined. */
// type ConfigFieldsWithDefaultValues = 'isolate';

/**
 * Default values for built-in Vitest config options that are used by our pool
 *
 * Only includes fields we need to provide defaults for.
 */
// export const DEFAULT_CONFIG: Required<Pick<ResolvedConfig, ConfigFieldsWithDefaultValues>> = {
//   isolate: false
// };

const DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS: Required<Pick<AssemblyScriptPoolOptions, ASPoolOptionsFieldsWithDefaultValues>> = {
  debug: false,
  coverageMode: COVERAGE_MODES.Failsafe,
  stripInline: true
};

/**
 * Get coverage mode flags for easy destructuring
 *
 * @param options - Pool options
 * @param config - Vitest resolved config
 * @returns Mode flags for conditional logic
 * @example
 * const { coverageEnabled, isFailsafeMode } = getCoverageModeFlags(ctx.config);
 */
export function getCoverageModeFlags(config: ResolvedConfig): CoverageModeFlags {
  const poolOptions = getPoolOptions(config);

  return {
    mode: poolOptions.coverageMode,
    isCoverageEnabled: isCoverageEnabled(config),
    isIntegratedMode: poolOptions.coverageMode === COVERAGE_MODES.Integrated,
    isFailsafeMode: poolOptions.coverageMode === COVERAGE_MODES.Failsafe,
  };
}

/**
 * Check if coverage is enabled in global-only coverage.enabled config
 *
 * @param config - Vitest resolved config
 * @returns True if coverage collection is enabled
 */
export function isCoverageEnabled(_config: ResolvedConfig): boolean {
  // return config.coverage.enabled;
  return true; // until we implement hybrid coverage.reporter
}

/**
 * Get AssemblyScript pool options from resolved config
 *
 * Extracts and casts poolOptions.assemblyScript from config with proper typing.
 * Resolves to default values if not user-provided.
 *
 * @param config - Vitest resolved config
 * @returns AssemblyScript pool options
 */


export function getPoolOptions(config: ResolvedConfig): ResolvedAssemblyScriptPoolOptions {
  const poolOptions: AssemblyScriptPoolOptions = config.poolOptions?.assemblyScript ?? DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS;
  const allOptionsFields = [...AS_POOL_FIELDS_WITH_DEFAULTS, ...AS_POOL_OPTIONAL_FIELDS];

  for (const configKey of allOptionsFields) {
    if (!poolOptions[configKey]) {
      // @ts-ignore
      poolOptions[configKey] = DEFAULT_ASSEMBLYSCRIPT_POOL_OTIONS[configKey]!;
    }
  }

  return poolOptions as ResolvedAssemblyScriptPoolOptions;
;
}
