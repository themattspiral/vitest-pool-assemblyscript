import type { CoverageV8Options } from 'vitest/node';

import type { HybridProviderOptions } from '../types/types.js';

/**
 * Module augmentation for CustomProviderOptions
 *
 * Vitest v3's CustomProviderOptions only includes fields with default values,
 * but users should be able to configure all optional fields from BaseCoverageOptions.
 * This augmentation adds the missing optional fields that work at runtime but
 * aren't typed in vitest v3.
 *
 * Additionally, we add AssemblyScript-specific coverage fields that our hybrid
 * coverage provider uses to glob AS source files separately from JS sources.
 *
 * By placing this augmentation here, it automatically loads when users import
 * our config helpers, providing proper coverage typing alongside pool typing.
 */
declare module 'vitest/node' {
  interface CustomProviderOptions extends HybridProviderOptions, Omit<CoverageV8Options, 'provider'> {
    provider: 'custom',

    /** Name of the module or path to a file to load the custom provider from */
	  customProviderModule: string;
  }
}
