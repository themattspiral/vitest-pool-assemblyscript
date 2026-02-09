/**
 * @inline decorator coverage verification.
 * Verifies that inlined function calls still contribute to the
 * original function's hit count.
 */

// @ts-ignore: decorator supported in AssemblyScript
@inline
export function inlinedAdd(a: i32, b: i32): i32 {
  return a + b;
}

export function normalAdd(a: i32, b: i32): i32 {
  return a + b;
}

/** Calls inlinedAdd — the inlined call should count toward inlinedAdd's hits */
export function callsInlined(a: i32, b: i32): i32 {
  return inlinedAdd(a, b);
}
