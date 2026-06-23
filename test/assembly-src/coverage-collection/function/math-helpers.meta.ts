/**
 * Identity anchor: deliberately shares the filename `math-helpers.meta.ts` with
 * function/edge/math-helpers.meta.ts to verify that same-named files in different
 * directories get distinct coverage entries. The `add` here returns a + b; the edge
 * copy returns a + b + 1, so the two are distinguishable by behavior as well as path.
 */

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function mainOnly(): i32 {
  return 7;
}
