// Statement layout + line-coverage parity twin (v8 oracle) — mirrors the AS fixture
// coverage-collection/statement/layout.meta.ts line-for-line. Compared in
// meta-verify/coverage-collection/statement/layout.test.ts. KEEP LINE-ALIGNED
// (this header matches the AS fixture's line count — do not change the line count).

export function multiLine(a: number, b: number): number {
  let sum = add(
    a,
    b
  );
  return sum;
}

function add(x: number, y: number): number {
  return x + y;
}

export function packed(n: number): number {
  let x = n; let y = n + 1;
  let a = 1, b = 2;
  return x + y + a + b;
}

export function unusedPath(n: number): number {
  let doubled = n * 2;
  return doubled;
}
