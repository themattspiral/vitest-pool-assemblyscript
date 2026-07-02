// Statement-KIND coverage parity twin (v8 oracle) — mirrors the AS fixture
// coverage-collection/statement/kinds.meta.ts line-for-line. Compared in
// meta-verify/coverage-collection/statement/kinds.test.ts. KEEP LINE-ALIGNED
// (this header matches the AS fixture's line count — do not change the line count).

// @ts-ignore
let sink = 0;

export function declarators(): number {
  let a = 1, b = 2, c = 3;
  return a + b + c;
}

export function expressions(n: number): number {
  let x = n;
  x = x + 1;
  x++;
  touch(x);
  return x;
}

function touch(v: number): void {
  sink = v;
}

export function loopControl(n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (i == 1) {
      continue;
    }
    if (i == 3) {
      break;
    }
    total = total + i;
  }
  return total;
}

export function maybeThrow(n: number): number {
  if (n < 0) {
    throw new Error("negative");
  }
  return n;
}
