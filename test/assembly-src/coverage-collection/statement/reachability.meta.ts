// Reachability statement-coverage fixtures — taken vs not-taken bodies, early-
// return dead paths, and the both-arms-return case where AS emits a trailing
// Unreachable at the last statement's position (the per-position MAX keeps the live count).
// Driven in reachability.meta.test.ts; assertions in meta-verify .../statement/
// reachability.test.ts. KEEP LINE-ALIGNED with js-coverage-parity-src/statement/reachability.ts.

export function classify(n: i32): i32 {
  if (n > 0) {
    return 1;
  } else {
    return -1;
  }
}

export function earlyReturn(n: i32): i32 {
  if (n < 0) {
    return 0;
  }
  let doubled = n * 2;
  return doubled;
}

export function guarded(flag: bool): i32 {
  let result = 0;
  if (flag) {
    result = 10;
  }
  return result;
}
