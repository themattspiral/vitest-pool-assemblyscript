import type { PoolOptions, CoverageModeFlags } from '../types.js';

/**
 * Get coverage mode flags for easy destructuring
 *
 * @param options - Pool options
 * @returns Mode flags for conditional logic
 * @example
 * const { isFailsafeMode, isDualMode } = getCoverageModeFlags(options);
 */
export function getCoverageModeFlags(options: PoolOptions): CoverageModeFlags {
  // TODO: In Phase 4h, check Vitest's test.coverage.enabled first
  // For now, if coverageMode is undefined, default to 'failsafe'
  const mode = options.coverageMode ?? 'failsafe';

  return {
    mode,
    isIntegratedMode: mode === 'integrated',
    isFailsafeMode: mode === 'failsafe',
  };
}

/**
 * Check if coverage is enabled at all
 */
export function isCoverageEnabled(_options: PoolOptions): boolean {
  // TODO: In Phase 4h, check Vitest's test.coverage.enabled
  // For now, coverage is always enabled (controlled by coverageMode)
  return true;
}
