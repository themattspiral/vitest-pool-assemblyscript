/**
 * if/else and ternary (cond-expr) branch fixtures for meta-verify, covering the
 * real (non-folded) decision constructs. Each function is exercised with KNOWN
 * inputs in branch-if-ternary.meta.test.ts so its per-arm branch hit counts are
 * exactly hand-derivable and match v8 semantics. Assertions live in
 * test/meta-verify/coverage-collection/branches-if-ternary.test.ts.
 *
 * An if's then/else arms are counted directly when located; an if WITHOUT an else
 * has its implicit-else hits derived as decisionHits − then. An else-if chain is
 * modelled as nested ifs (one 'if' branch per `if`/`else if`), matching Istanbul.
 */

// Plain if/else, both arms taken across calls.
export function absVal(n: i32): i32 {
  if (n < 0) {
    return -n;
  } else {
    return n;
  }
}

// if WITHOUT else: then taken once, implicit-else taken once (derived, not counted
// directly).
export function clampLow(n: i32): i32 {
  if (n < 0) {
    return 0;
  }
  return n;
}

// if / else-if / else chain → two nested 'if' branches: the outer (n<0 / rest) and
// the inner (n==0 / n>0). Both decisions are located comparisons.
export function classify(n: i32): i32 {
  if (n < 0) {
    return -1;
  } else if (n == 0) {
    return 0;
  } else {
    return 1;
  }
}

// Nested if, neither with an explicit else: the inner if is only reached when the
// outer then is taken; both implicit elses are derived.
export function clampRange(n: i32): i32 {
  if (n > 0) {
    if (n > 100) {
      return 100;
    }
    return n;
  }
  return 0;
}

// Ternary (cond-expr), both arms taken.
export function pickFirst(flag: bool): i32 {
  return flag ? 1 : 2;
}

// Ternary exercised on the ELSE arm only (then arm never taken → reads 0).
export function orDefault(n: i32, fallback: i32): i32 {
  return n != 0 ? n : fallback;
}

// Nested ternary `a ? b : (c ? d : e)` → two cond-expr branches sharing a start
// line; the outer (leftmost condition) sorts before the inner.
export function sign(n: i32): i32 {
  return n > 0 ? 1 : (n < 0 ? -1 : 0);
}
