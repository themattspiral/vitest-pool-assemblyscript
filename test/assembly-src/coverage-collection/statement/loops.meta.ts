// Loop statement-coverage fixtures — exercise the entry-position rule (a loop
// is *reached* once; its body runs N times). Driven with known iteration counts in
// loops.meta.test.ts; assertions in meta-verify/coverage-collection/statement/
// loops.test.ts. KEEP LINE-ALIGNED with the twin js-coverage-parity-src/statement/loops.ts.

export function forSum(n: i32): i32 {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += i;
  }
  return total;
}

export function whileCountdown(n: i32): i32 {
  let steps = 0;
  while (n > 0) {
    n = n - 1;
    steps = steps + 1;
  }
  return steps;
}

export function doAtLeastOnce(n: i32): i32 {
  let count = 0;
  do {
    count = count + 1;
    n = n - 1;
  } while (n > 0);
  return count;
}

export function nestedLoops(rows: i32, cols: i32): i32 {
  let cells = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells = cells + 1;
    }
  }
  return cells;
}

export function neverLooped(n: i32): i32 {
  let x = 0;
  for (let i = 0; i < n; i++) {
    x = x + 100;
  }
  return x;
}
