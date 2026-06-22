// Statement layout + line-coverage fixtures — a multi-line statement (its entry line
// gets the hit), multiple statements on one line, a two-declarator Variable, and an
// uncovered function (its body lines uncovered). Driven in layout.meta.test.ts;
// assertions in .../statement/layout.test.ts. KEEP LINE-ALIGNED with the twin.

export function multiLine(a: i32, b: i32): i32 {
  let sum = add(
    a,
    b
  );
  return sum;
}

function add(x: i32, y: i32): i32 {
  return x + y;
}

export function packed(n: i32): i32 {
  let x = n; let y = n + 1;
  let a = 1, b = 2;
  return x + y + a + b;
}

export function unusedPath(n: i32): i32 {
  let doubled = n * 2;
  return doubled;
}
