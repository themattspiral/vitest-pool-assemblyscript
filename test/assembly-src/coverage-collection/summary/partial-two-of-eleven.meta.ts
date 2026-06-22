/**
 * 11 functions, 2 tested — target ~18.18% function coverage.
 * Produces a non-whole-number coverage percentage for summary reporting.
 */

export function increment(value: i32): i32 {
  return value + 1;
}

export function decrement(value: i32): i32 {
  return value - 1;
}

export function doubleIt(value: i32): i32 {
  return value * 2;
}

export function tripleIt(value: i32): i32 {
  return value * 3;
}

export function quadrupleIt(value: i32): i32 {
  return value * 4;
}

export function negate(value: i32): i32 {
  return -value;
}

export function isNegative(value: i32): bool {
  return value < 0;
}

export function isOdd(value: i32): bool {
  return value % 2 != 0;
}

export function max(a: i32, b: i32): i32 {
  return a > b ? a : b;
}

export function min(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

export function clamp(value: i32, lo: i32, hi: i32): i32 {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}
