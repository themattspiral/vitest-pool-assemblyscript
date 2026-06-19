/**
 * Branch-coverage fixtures for meta-verify. Each function is exercised with KNOWN
 * inputs in branch-coverage.meta.test.ts so its per-arm branch hit counts are
 * exactly hand-derivable and match v8's "entered" semantics (see branches.test.ts).
 */

// Empty fall-through switch: cases 0 and 6 share a body (case 0 is empty); cases
// 1 and 2 share a body (case 1 is empty); explicit default with a body. The empty
// fall-through cases (0, 1) are exactly the construct the empty-case fix targets —
// an untested empty case must read 0, an entered one its true count.
export function dayType(day: i32): i32 {
  let r: i32 = 0;
  switch (day) {
    case 0:
    case 6:
      r = 1;
      break;
    case 1:
    case 2:
      r = 2;
      break;
    default:
      r = 0;
  }
  return r;
}

// Clean switch: every case has its own body (no fall-through), explicit default.
export function category(val: i32): i32 {
  switch (val) {
    case 1:
      return 10;
    case 2:
      return 20;
    default:
      return -1;
  }
}

// if without else: the implicit else arm is derived (decisionHits − then), not
// directly counted.
export function clampLow(n: i32): i32 {
  if (n < 0) {
    return 0;
  }
  return n;
}

// ternary (cond-expr).
export function pickFirst(flag: bool): i32 {
  return flag ? 1 : 2;
}

// Folded (compile-time-constant) conditions: the compiler removes the branch, so
// there is no decision block. Coverage must still match v8 — the live arm covered,
// the eliminated dead arm 0.
export function foldedIf(x: i32): i32 {
  if (true) {
    return 1;
  } else {
    return 2;
  }
}

export function foldedTernary(x: i32): i32 {
  return true ? 10 : 20;
}

// Folded logical with a REAL right operand (the `FLAG && check()` shape). A constant
// left folds the short-circuit decision; the right is evaluated iff the left's value
// allows it (`&&` left-true).
export function foldedAndEval(x: i32): bool {
  return true && x > 0;   // left true → right (x>0) evaluated
}

export function foldedAndShort(x: i32): bool {
  return false && x > 0;  // left false → right short-circuited away
}
