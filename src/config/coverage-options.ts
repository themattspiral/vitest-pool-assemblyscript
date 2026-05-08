import type { HybridProviderOptions } from '../types/types.js';

/**
 * Module augmentation for vitest 4.1.1+ — augments `CoverageOptions` directly.
 *
 * In v4.1.1+ (vitest PR #9931), `CoverageOptions` was flattened from a
 * generic discriminated type alias into a single interface that covers all
 * coverage providers. `CustomProviderOptions` became a deprecated alias
 * (`interface CustomProviderOptions extends CoverageOptions {}`), so the
 * canonical augmentation point is now `CoverageOptions` itself.
 *
 * Adds AssemblyScript-specific coverage fields used by the hybrid coverage
 * provider. `provider` and `customProviderModule` are already declared on
 * `CoverageOptions` natively in v4.1.1+, so no narrowing is needed here.
 *
 * Loaded as a side-effect import from `./index.ts` (the v4 config entry
 * point) so it only takes effect for users who explicitly import the v4
 * entry. v3 users get the equivalent typing from
 * `./custom-provider-options-v3.ts`, which augments `CustomProviderOptions`
 * (the only augmentation point that's an interface in both versions).
 */
declare module 'vitest/node' {
  interface CoverageOptions extends HybridProviderOptions {}
}
