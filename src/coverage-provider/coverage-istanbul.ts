/**
 * Istanbul coverage entry point.
 *
 * Exposed to users as `vitest-pool-assemblyscript/coverage-istanbul`.
 * Configuring it as `coverage.customProviderModule` selects the istanbul
 * built-in provider for JS/TS coverage, with AssemblyScript coverage merged in.
 *
 * Vitest core loads this module for `getProvider()`; vitest workers load it for
 * the runtime coverage hooks.
 */

import type { CoverageProviderModule } from 'vitest/node';

import { createDelegatedCoverageModule } from './delegate-coverage-module.js';
import { JS_COVERAGE_PROVIDERS } from '../types/constants.js';

const coverageIstanbulModule: CoverageProviderModule = createDelegatedCoverageModule(JS_COVERAGE_PROVIDERS.Istanbul);

export default coverageIstanbulModule;
