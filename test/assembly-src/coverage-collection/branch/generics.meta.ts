/**
 * Generic (monomorphized) branch fixtures for meta-verify. A generic function is
 * compiled once per type argument, but a branch inside it is ONE source construct.
 * Its per-arm hit counts must SUM across all monomorphized instances (the decision
 * key is source-derived, so every instance keys to the same branch). Each function
 * here is instantiated at i32 and f64.
 */

// Generic if branch, monomorphized at i32 and f64: arm hits sum across instances.
export function clampGeneric<T>(n: T, lo: T): T {
  if (n < lo) {
    return lo;
  }
  return n;
}

// Generic ternary (cond-expr), monomorphized at i32 and f64.
export function pickGeneric<T>(flag: bool, a: T, b: T): T {
  return flag ? a : b;
}
