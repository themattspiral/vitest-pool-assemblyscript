/**
 * Comparison utility functions
 */

export function lessThan(a: i32, b: i32): bool {
  return a < b;
}

export function greaterThan(a: i32, b: i32): bool {
  return a > b;
}

export function equals(a: i32, b: i32): bool {
  return a == b;
}

export function notEquals(a: i32, b: i32): bool {
  return a != b;
}

export function andOp(a: bool, b: bool): bool {
  return a && b;
}

export function orOp(a: bool, b: bool): bool {
  return a || b;
}

export function notOp(a: bool): bool {
  return !a;
}
