/**
 * Coverage Provider Module Export
 *
 * This module exports the hybrid coverage provider for Vitest to load.
 * Users configure this via:
 *   coverage.provider = 'custom'
 *   coverage.customProviderModule = 'vitest-pool-assemblyscript/coverage'
 */

export { default } from './hybrid-coverage-provider.js';
