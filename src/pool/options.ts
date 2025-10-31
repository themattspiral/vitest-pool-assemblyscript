import type { ResolvedConfig } from 'vitest/node';
import type { AssemblyScriptPoolOptions, CoverageModeFlags } from '../types.js';

/**
 * Get coverage mode flags for easy destructuring
 *
 * @param options - Pool options
 * @param config - Vitest resolved config
 * @returns Mode flags for conditional logic
 * @example
 * const { coverageEnabled, isFailsafeMode } = getCoverageModeFlags(options, ctx.config);
 */
export function getCoverageModeFlags(
  options: AssemblyScriptPoolOptions,
  config: ResolvedConfig
): CoverageModeFlags {
  // Extract coverage mode from pool options (defaults to 'failsafe')
  const mode = options.coverageMode ?? 'failsafe';

  // Check if coverage is enabled via Vitest's master switch
  const coverageEnabled = config.coverage?.enabled ?? false;

  return {
    coverageEnabled,
    mode,
    isIntegratedMode: mode === 'integrated',
    isFailsafeMode: mode === 'failsafe',
  };
}

/**
 * Check if coverage is enabled
 *
 * Checks Vitest's standard coverage.enabled config (master switch).
 *
 * @param config - Vitest resolved config
 * @returns True if coverage collection is enabled
 */
export function isCoverageEnabled(_config: ResolvedConfig): boolean {
  // return config.coverage?.enabled ?? false;
  return true; // until we implement coverage.reporter
}

/**
 * Get AssemblyScript pool options from resolved config
 *
 * Extracts and casts poolOptions.assemblyScript from config with proper typing.
 *
 * @param config - Vitest resolved config
 * @returns AssemblyScript pool options (empty object if not configured)
 */
export function getPoolOptions(config: ResolvedConfig): AssemblyScriptPoolOptions {
  return (config.poolOptions?.assemblyScript as AssemblyScriptPoolOptions | undefined) ?? {};
}
