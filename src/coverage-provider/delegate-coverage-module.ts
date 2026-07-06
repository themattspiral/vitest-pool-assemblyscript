/**
 * Builds the `CoverageProviderModule` for one coverage entry point
 * (`/coverage-v8` or `/coverage-istanbul`).
 *
 * The entry the user points `coverage.customProviderModule` at IS the JS
 * coverage provider selection — there is no config option, env var, or path
 * redirection. Vitest core loads the entry module for `getProvider()`, and
 * vitest workers load the SAME module for the runtime coverage hooks
 * (`startCoverage` / `takeCoverage` / `stopCoverage`); both carry the provider
 * identity fixed here.
 *
 * The worker hooks forward to the selected delegate package, imported lazily so
 * only the chosen optional peer loads (and the hybrid provider can preflight it
 * first, core-side). `stopCoverage` is present ONLY for v8: the istanbul
 * package genuinely omits it, and vitest existence-gates the call in every
 * worker teardown, so a present-but-throwing hook would raise one unhandled
 * error per JS worker run.
 */

import type { CoverageProviderModule } from 'vitest/node';

import { JS_COVERAGE_PROVIDERS } from '../types/constants.js';
import type { JsCoverageProvider } from '../types/types.js';
import { HybridCoverageProvider } from './hybrid-coverage-provider.js';
import { loadDelegateCoverageModule } from './delegate-loader.js';

export function createDelegatedCoverageModule(jsProvider: JsCoverageProvider): CoverageProviderModule {
  const coverageModule: CoverageProviderModule = {
    getProvider: () => new HybridCoverageProvider(jsProvider),

    startCoverage: async (runtimeOptions) => {
      const delegate = await loadDelegateCoverageModule(jsProvider);
      return delegate.startCoverage?.(runtimeOptions);
    },

    takeCoverage: async (runtimeOptions) => {
      const delegate = await loadDelegateCoverageModule(jsProvider);
      return delegate.takeCoverage?.(runtimeOptions);
    },
  };

  // Only v8 provides `stopCoverage`; the istanbul package omits it entirely, so
  // this hook must be genuinely absent for istanbul (see the module doc above).
  if (jsProvider === JS_COVERAGE_PROVIDERS.V8) {
    coverageModule.stopCoverage = async (runtimeOptions) => {
      const delegate = await loadDelegateCoverageModule(jsProvider);
      return delegate.stopCoverage?.(runtimeOptions);
    };
  }

  return coverageModule;
}
