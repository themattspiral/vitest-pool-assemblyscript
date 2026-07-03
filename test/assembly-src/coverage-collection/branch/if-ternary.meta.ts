/**
 * if/else and ternary (cond-expr) branch fixtures for meta-verify, covering the
 * real (non-folded) decision constructs. Each function is exercised with KNOWN
 * inputs in branch-if-ternary.meta.test.ts so its per-arm branch hit counts are
 * exactly hand-derivable and match v8 semantics.
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

// if/else exercised on the THEN arm ONLY: the explicit else is genuinely untested
// and reads 0 — the canonical uncovered-branch (red arm) users care about.
export function gateThenOnly(n: i32): i32 {
  if (n > 0) {
    return 1;
  } else {
    return 0;
  }
}

// if WITHOUT else exercised on the IMPLICIT-ELSE path ONLY: the then arm is
// untested (reads 0) and the implicit else is derived.
export function guardElseOnly(n: i32): i32 {
  if (n < 0) {
    return -1;
  }
  return n;
}

// if WITHOUT else PRECEDED by straight-line statements in the same basic block
// (regression for issue #37): the decision block's located expressions start at
// the preceding statements, not the condition, so folded-branch detection must
// key on the block's LAST located expression — otherwise this real branch is
// misclassified as compiler-folded and its taken implicit else reads 0.
export function gateAfterStmts(n: i32): i32 {
  const doubled = n * 2;
  const shifted = doubled + 1;
  if (doubled + shifted <= 10) {
    return 1;
  }
  return 0;
}

// The same statement-preceded if-without-else shape inside a for-loop body (the
// shape issue #37 was reported from): the loop-body block starts at the
// assignment, not the condition.
export function countBelowThreshold(limit: i32): i32 {
  let count: i32 = 0;
  let product: i32 = 0;

  for (let i: i32 = 0; i < limit; i++) {
    product = i * 3;

    if (product < 6) {
      count++;
    }
  }

  return count;
}

// Statement-preceded if WITH an explicit else: both arms located. Pins that the
// statement-preceded block shape stays correct when no arm needs deriving.
export function gateAfterStmtsWithElse(n: i32): i32 {
  const doubled = n * 2;
  if (doubled > 4) {
    return 1;
  } else {
    return 0;
  }
}
