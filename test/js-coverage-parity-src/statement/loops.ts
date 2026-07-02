// Loop statement-coverage parity twin (v8 oracle) — mirrors the AS fixture
// coverage-collection/statement/loops.meta.ts line-for-line. v8's statement counts
// here are the parity target for the AS coverage, compared in
// meta-verify/coverage-collection/statement/loops.test.ts. KEEP LINE-ALIGNED.

export function forSum(n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += i;
  }
  return total;
}

export function whileCountdown(n: number): number {
  let steps = 0;
  while (n > 0) {
    n = n - 1;
    steps = steps + 1;
  }
  return steps;
}

export function doAtLeastOnce(n: number): number {
  let count = 0;
  do {
    count = count + 1;
    n = n - 1;
  } while (n > 0);
  return count;
}

export function nestedLoops(rows: number, cols: number): number {
  let cells = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells = cells + 1;
    }
  }
  return cells;
}

export function neverLooped(n: number): number {
  let x = 0;
  for (let i = 0; i < n; i++) {
    x = x + 100;
  }
  return x;
}
