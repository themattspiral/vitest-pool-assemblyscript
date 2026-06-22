// Statement-KIND coverage — the coverable kinds not exercised by loops/reachability:
// module + multi-declarator Variable, ExpressionStatement (assign/increment/call),
// a void helper body, Continue, Break, and Throw (left uncovered). Driven in
// kinds.meta.test.ts; assertions in .../statement/kinds.test.ts. KEEP LINE-ALIGNED.

let sink: i32 = 0;

export function declarators(): i32 {
  let a = 1, b = 2, c = 3;
  return a + b + c;
}

export function expressions(n: i32): i32 {
  let x = n;
  x = x + 1;
  x++;
  touch(x);
  return x;
}

function touch(v: i32): void {
  sink = v;
}

export function loopControl(n: i32): i32 {
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

export function maybeThrow(n: i32): i32 {
  if (n < 0) {
    throw new Error("negative");
  }
  return n;
}
