// Never-imported parity twin — mirrors the AS fixture line-for-line. Whether v8
// reports a never-loaded included file is the parity question for AS's report-
// uncovered-source feature. Compared in .../statement/zerohit.test.ts. KEEP LINE-ALIGNED
// (this header matches the AS fixture's line count — do not change the line count).

export function untestedAdd(a: number, b: number): number {
  let sum = a + b;
  return sum;
}

export function untestedBranch(n: number): number {
  if (n > 0) {
    return 1;
  }
  return 0;
}
