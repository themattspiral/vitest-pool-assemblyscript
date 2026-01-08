/**
 * Coverage Provider Module Export
 *
 * This module exports the hybrid coverage provider for Vitest to load.
 * Users configure this via:
 *   coverage.provider = 'custom'
 *   coverage.customProviderModule = 'vitest-pool-assemblyscript/coverage'
 */

import { CoverageProviderModule } from 'vitest/node';
import { ModuleExecutionInfo } from 'vite-node';
import v8CoverageModule from '@vitest/coverage-v8';

import { POOL_ERROR_NAMES } from '../types/constants.js';
import { createPoolError } from '../util/pool-errors.js';
import { HybridCoverageProvider } from './hybrid-coverage-provider.js';

/**
 * Hybrid Coverage Provider
 *
 * This provider handles both AssemblyScript and JavaScript and coverage
 * - Converts AS coverage to Istanbul format
 * - Delegates JS coverage to Vitest's v8 provider
 * - Merges both into a unified coverage report
 */
const hybridProviderModule: CoverageProviderModule = {
  getProvider: (): HybridCoverageProvider => new HybridCoverageProvider(),

  startCoverage: async (runtimeOptions: {
    isolate: boolean
  }): Promise<unknown> => {
    if (v8CoverageModule.startCoverage) {
      return await v8CoverageModule.startCoverage(runtimeOptions);
    } else {
      throw createPoolError(
        'HybridCoverageProvider - v8 coverage module does not provide `startCoverage`',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }
  },
  
  takeCoverage: async (runtimeOptions?: {
    moduleExecutionInfo?: ModuleExecutionInfo
  }): Promise<unknown> => {
    if (v8CoverageModule.takeCoverage) {
      return await v8CoverageModule.takeCoverage(runtimeOptions);
    } else {
      throw createPoolError(
        'HybridCoverageProvider - v8 coverage module does not provide `takeCoverage`',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }
  },
  
  stopCoverage: async (runtimeOptions: {
    isolate: boolean
  }): Promise<unknown> => {
    if (v8CoverageModule.stopCoverage) {
      return await v8CoverageModule.stopCoverage(runtimeOptions);
    } else {
      throw createPoolError(
        'HybridCoverageProvider - v8 coverage module does not provide `stopCoverage`',
        POOL_ERROR_NAMES.HybridCoverageProviderError
      );
    }
  },
};

export default hybridProviderModule;
