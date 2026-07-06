/**
 * Dynamic loader for the delegated built-in JS coverage provider module.
 *
 * Both `@vitest/coverage-v8` and `@vitest/coverage-istanbul` are OPTIONAL peer
 * dependencies, so neither may be imported statically from any module vitest
 * always loads. Literal import specifiers (one per branch) keep both packages
 * external to the bundle and load only the selected one, at call time — which
 * also lets the hybrid provider run its install preflight BEFORE the import.
 *
 * ESM dynamic `import()` caches the module, so repeated calls return the same
 * delegate module instance — preserving any module-internal state the delegate
 * keeps between its worker hook calls (e.g. v8's live inspector session).
 */

import type { CoverageProviderModule } from 'vitest/node';

import { JS_COVERAGE_PROVIDERS } from '../types/constants.js';
import type { JsCoverageProvider } from '../types/types.js';

export async function loadDelegateCoverageModule(
  jsProvider: JsCoverageProvider,
): Promise<CoverageProviderModule> {
  if (jsProvider === JS_COVERAGE_PROVIDERS.Istanbul) {
    return (await import('@vitest/coverage-istanbul')).default;
  }
  return (await import('@vitest/coverage-v8')).default;
}
