// Reachability statement-coverage parity twin (v8 oracle) — mirrors the AS fixture
// coverage-collection/statement/reachability.meta.ts line-for-line. v8's statement
// counts here are the parity target for the AS coverage, compared in
// meta-verify/coverage-collection/statement/reachability.test.ts. KEEP LINE-ALIGNED
// (this header matches the AS fixture's line count — do not change the line count).

export function classify(n: number): number {
  if (n > 0) {
    return 1;
  } else {
    return -1;
  }
}

export function earlyReturn(n: number): number {
  if (n < 0) {
    return 0;
  }
  let doubled = n * 2;
  return doubled;
}

export function guarded(flag: boolean): number {
  let result = 0;
  if (flag) {
    result = 10;
  }
  return result;
}
