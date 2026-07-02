/**
 * if/else and ternary (cond-expr) branch parity twin (v8 oracle) — mirrors the AS
 * fixture coverage-collection/branch/if-ternary.meta.ts construct-for-construct, and
 * via branch/if-ternary.test.ts the same inputs, so v8's branch coverage is the
 * cross-check oracle. Compared in meta-verify/coverage-collection/branch/if-ternary.test.ts.
 */

// Plain if/else, both arms taken.
export function absVal(n: number): number {
  if (n < 0) {
    return -n;
  } else {
    return n;
  }
}

// if WITHOUT else: then taken once, implicit else taken once.
export function clampLow(n: number): number {
  if (n < 0) {
    return 0;
  }
  return n;
}

// if / else-if / else chain → two nested 'if' branches.
export function classify(n: number): number {
  if (n < 0) {
    return -1;
  } else if (n === 0) {
    return 0;
  } else {
    return 1;
  }
}

// Nested if, neither with an explicit else.
export function clampRange(n: number): number {
  if (n > 0) {
    if (n > 100) {
      return 100;
    }
    return n;
  }
  return 0;
}

// Ternary (cond-expr), both arms taken.
export function pickFirst(flag: boolean): number {
  return flag ? 1 : 2;
}

// Ternary exercised on the ELSE arm only (then arm never taken → reads 0).
export function orDefault(n: number, fallback: number): number {
  return n !== 0 ? n : fallback;
}

// Nested ternary `a ? b : (c ? d : e)` → two cond-expr branches sharing a start line.
export function sign(n: number): number {
  return n > 0 ? 1 : (n < 0 ? -1 : 0);
}

// if/else exercised on the THEN arm ONLY: the explicit else is untested (reads 0).
export function gateThenOnly(n: number): number {
  if (n > 0) {
    return 1;
  } else {
    return 0;
  }
}

// if WITHOUT else exercised on the IMPLICIT-ELSE path ONLY: then arm untested (reads 0).
export function guardElseOnly(n: number): number {
  if (n < 0) {
    return -1;
  }
  return n;
}
