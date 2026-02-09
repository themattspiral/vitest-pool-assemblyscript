/**
 * 7 functions, 3 tested — target ~42.86% function coverage.
 * Produces a non-whole-number coverage percentage for summary reporting.
 */

export function toUpperBound(value: i32, max: i32): i32 {
  return value > max ? max : value;
}

export function toLowerBound(value: i32, min: i32): i32 {
  return value < min ? min : value;
}

export function absoluteValue(value: i32): i32 {
  return value < 0 ? -value : value;
}

export function sign(value: i32): i32 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function isEven(value: i32): bool {
  return value % 2 == 0;
}

export function isPositive(value: i32): bool {
  return value > 0;
}

export function isZero(value: i32): bool {
  return value == 0;
}
