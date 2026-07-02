/**
 * Logical-operator (binary-expr) branch parity twin (v8 oracle) — mirrors the AS
 * fixture coverage-collection/branch/logical.meta.ts construct-for-construct, and via
 * branch/logical.test.ts the same inputs, so v8's branch coverage is the cross-check
 * oracle. v8 logical semantics: left operand counted every evaluation; right only when
 * the left's value forces it (`&&` left-true, `||` left-false). Compared in
 * meta-verify/coverage-collection/branch/logical.test.ts.
 */

// Real `&&`: left = times evaluated, right = times left is true.
export function andCheck(a: number, b: number): boolean {
  return a > 0 && b > 0;
}

// Real `||`: left = times evaluated, right = times left is false.
export function orCheck(a: number, b: number): boolean {
  return a > 0 || b > 0;
}

// Fused-logical `if (a && b)` WITHOUT else.
export function ifAnd(a: number, b: number): number {
  if (a > 0 && b > 0) {
    return 1;
  }
  return 0;
}

// Fused-logical `if (a || b)` WITH an explicit else.
export function ifOr(a: number, b: number): number {
  if (a > 0 || b > 0) {
    return 1;
  } else {
    return 0;
  }
}

// Chained `a && b && c` = `(a && b) && c`: two nested `&&` branches sharing a start.
export function andChain(a: number, b: number, c: number): boolean {
  return a > 0 && b > 0 && c > 0;
}
