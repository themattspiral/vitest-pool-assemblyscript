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
