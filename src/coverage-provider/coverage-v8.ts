/**
 * Canonical v8 coverage entry point.
 *
 * Exposed to users as `vitest-pool-assemblyscript/coverage-v8`, and as the
 * target of the back-compat `vitest-pool-assemblyscript/coverage` alias.
 * Configuring either as `coverage.customProviderModule` selects the v8 built-in
 * provider for JS/TS coverage, with AssemblyScript coverage merged in.
 *
 * Vitest core loads this module for `getProvider()`; vitest workers load it for
 * the runtime coverage hooks.
 */

import type { CoverageProviderModule } from 'vitest/node';

import { createDelegatedCoverageModule } from './delegate-coverage-module.js';
import { JS_COVERAGE_PROVIDERS } from '../types/constants.js';

const coverageV8Module: CoverageProviderModule = createDelegatedCoverageModule(JS_COVERAGE_PROVIDERS.V8);

export default coverageV8Module;
