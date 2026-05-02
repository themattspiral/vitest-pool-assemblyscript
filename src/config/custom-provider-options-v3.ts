import type { CoverageV8Options } from 'vitest/node';

import type { HybridProviderOptions } from '../types/types.js';

/**
 * Module augmentation for vitest 3.x — augments `CustomProviderOptions`.
 *
 * In v3, `CoverageOptions` is a generic type alias and cannot be augmented
 * via TypeScript declaration merging (a type alias and an interface with the
 * same name in the same scope produces `Duplicate identifier`). The only
 * augmentation point that's an interface in both v3 and v4 is
 * `CustomProviderOptions`, so the v3 entry uses that.
 *
 * v3's native `CustomProviderOptions` is also very narrow (only fields with
 * defaults plus `customProviderModule`), so this augmentation widens it via
 * `Omit<CoverageV8Options, 'provider'>` to give v3 users full coverage
 * configuration typing alongside the AssemblyScript-specific fields from
 * `HybridProviderOptions`.
 *
 * Loaded as a side-effect import from `./index-v3.ts` (the v3 config entry
 * point) so it only takes effect for users who explicitly import the v3
 * entry. v4 users get the equivalent typing from `./coverage-options.ts`,
 * which augments `CoverageOptions` directly.
 */
declare module 'vitest/node' {
  interface CustomProviderOptions extends HybridProviderOptions, Omit<CoverageV8Options, 'provider'> {
    provider: 'custom',

    /** Name of the module or path to a file to load the custom provider from */
	  customProviderModule: string;
  }
}
