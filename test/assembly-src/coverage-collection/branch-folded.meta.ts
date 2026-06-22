/**
 * Folded (compile-time-constant) branch fixtures for meta-verify. When a condition
 * is constant, AS folds the branch away at -O0 — there is NO decision block in the
 * binary. v8 still REPORTS the branch with constant-determined coverage (the live
 * arm covered, the eliminated arm 0), so we must too. Detection is by
 * decision-presence (a source branch whose condition range contains no binary
 * decision is folded), which catches non-literal folds (named consts, constant
 * comparisons, fused logicals) that AST-literal detection would miss.
 *
 * Each function is exercised ONCE in branch-folded.meta.test.ts. Assertions live in
 * test/meta-verify/coverage-collection/branches-folded.test.ts.
 */

// if(true) / if(false): the live arm survives, the dead arm is eliminated.
export function foldedIfTrue(x: i32): i32 {
  if (true) {
    return 1;
  } else {
    return 2;
  }
}

export function foldedIfFalse(x: i32): i32 {
  if (false) {
    return 1;
  } else {
    return 2;
  }
}

// Nested if(true){ if(true){…} } — both fold. Mirrors the class-consumer shape
// (the incidental R8 example). Implicit elses of folded ifs read 0.
export function foldedNested(x: i32): i32 {
  if (true) {
    if (true) {
      return 1;
    }
    return 2;
  }
  return 3;
}

// Named-constant condition: AST-literal detection would see the identifier `FLAG`,
// not `true`, and miss the fold — decision-presence catches it.
const FLAG: bool = true;
export function foldedNamedConst(x: i32): i32 {
  if (FLAG) {
    return 1;
  }
  return 0;
}

// Constant comparison `1 < 2`: folds to a constant. AST-literal detection would see
// a comparison, not a bool literal — decision-presence catches it.
export function foldedCompare(x: i32): i32 {
  if (1 < 2) {
    return 1;
  }
  return 0;
}

// Fused logical of constants `true && true`: folds to a single const. The IF is
// detected folded via decision-presence; the `&&` binary-expr is the accepted
// const/const degenerate case (see assertions).
export function foldedFusedAndConst(x: i32): i32 {
  if (true && true) {
    return 1;
  }
  return 0;
}

// Folded ternary with BOTH arms compile-time constants: collapses to a single
// result const at the construct start — neither arm range catches a hit. ACCEPTED
// "erased -> blind" gap (reads [0,0] vs v8's [1,0]).
export function foldedTernaryConst(x: i32): i32 {
  return true ? 10 : 20;
}

// Folded ternary with a NON-constant live arm: the live arm's code survives at its
// own position, so it is correctly covered.
export function foldedTernaryLive(x: i32): i32 {
  return true ? x + 1 : x + 2;
}

// Folded logicals with a REAL right operand. A constant LEFT folds the
// short-circuit decision; the right survives iff the left's value evaluates it
// (`&&` left-true, `||` left-false).
export function foldedAndEval(x: i32): bool {
  return true && x > 0;   // left true -> right evaluated
}

export function foldedAndShort(x: i32): bool {
  return false && x > 0;  // left false -> right short-circuited away
}

export function foldedOrShort(x: i32): bool {
  return true || x > 0;   // left true -> right short-circuited away
}

export function foldedOrEval(x: i32): bool {
  return false || x > 0;  // left false -> right evaluated
}
