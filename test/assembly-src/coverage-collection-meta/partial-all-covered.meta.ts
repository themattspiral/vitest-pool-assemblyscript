/**
 * 5 functions, all tested — target 100% function coverage.
 * Exists alongside the partial coverage files for summary comparison.
 */

export function addOne(value: i32): i32 {
  return value + 1;
}

export function subtractOne(value: i32): i32 {
  return value - 1;
}

export function doubleValue(value: i32): i32 {
  return value * 2;
}

export function isNonNegative(value: i32): bool {
  return value >= 0;
}

export function sumThree(a: i32, b: i32, c: i32): i32 {
  return a + b + c;
}
