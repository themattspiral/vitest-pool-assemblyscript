/**
 * Cross-file coverage attribution for the 100% passing set. Imports a class + function
 * from another file; `new Widget()` (no argument) inlines the provider's defaulted
 * constructor parameter, which must attribute back to the provider's constructor and
 * not pollute this file's statements. Branch-free; every export is exercised.
 */

import { Widget, providerHelper } from './cross-file-provider';

export function makeDefaultWidget(): i32 {
  const w = new Widget();
  return w.area();
}

export function useProviderHelper(): i32 {
  return providerHelper() + 1;
}
