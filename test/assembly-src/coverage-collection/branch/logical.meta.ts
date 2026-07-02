/**
 * Logical-operator branch fixtures for meta-verify: real (non-folded) `&&` / `||`
 * and "fused-logical" conditions (an `if` whose condition is a logical expression).
 * Each function is exercised with KNOWN inputs in branch-logical.meta.test.ts so
 * its per-arm branch hit counts are exactly hand-derivable and match v8's "entered"
 * branch semantics.
 *
 * v8 logical (binary-expr) semantics: the LEFT operand is counted every time the
 * expression is evaluated; the RIGHT operand only when the left's value forces it
 * to be evaluated (`&&` left-true, `||` left-false). Counts are per-evaluation.
 */

// Real `&&` (runtime-valued operands → the short-circuit decision survives; not
// constant-folded). left = times evaluated; right = times left is true.
export function andCheck(a: i32, b: i32): bool {
  return a > 0 && b > 0;
}

// Real `||`. left = times evaluated; right = times left is false.
export function orCheck(a: i32, b: i32): bool {
  return a > 0 || b > 0;
}

// Fused-logical `if (a && b)` WITHOUT else. The if's decision block is UNLOCATED
// (its condition is the synthetic `&&` result), so the if's decisionHits is
// derived from the leftmost atom `a`'s hit count, and the implicit else =
// decisionHits − then.
export function ifAnd(a: i32, b: i32): i32 {
  if (a > 0 && b > 0) {
    return 1;
  }
  return 0;
}

// Fused-logical `if (a || b)` WITH an explicit else. Both arms are located, so
// both are counted directly (no decisionHits derivation needed).
export function ifOr(a: i32, b: i32): i32 {
  if (a > 0 || b > 0) {
    return 1;
  } else {
    return 0;
  }
}

// Chained `a && b && c` = `(a && b) && c`: two nested `&&` branches sharing the
// same start position. The inner (`a && b`, smaller range) is ordered before the
// outer (`(a && b) && c`, larger range) by branch-location sort.
export function andChain(a: i32, b: i32, c: i32): bool {
  return a > 0 && b > 0 && c > 0;
}
