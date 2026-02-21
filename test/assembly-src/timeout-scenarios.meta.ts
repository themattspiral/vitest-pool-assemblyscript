// Source file for timeout scenario verification.
// Provides a deterministic infinite loop for triggering timeouts
// and a simple function for non-timeout tests.

/** Enters an infinite loop — guaranteed to trigger any timeout. */
export function infiniteLoop(): void {
  while (true) {}
}

/** Simple function that returns a known value. Used by non-timeout tests. */
export function simpleFunc(): i32 {
  return 42;
}
