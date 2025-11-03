/**
 * Edge case handling utilities
 */

export function addZeros(a: i32, b: i32): i32 {
  return a + b;
}

export function multiplyByZero(a: i32): i32 {
  return a * 0;
}

export function addNegatives(a: i32, b: i32): i32 {
  return a + b;
}

export function multiplyNegatives(a: i32, b: i32): i32 {
  return a * b;
}

export function divideNegative(a: i32, b: i32): i32 {
  return a / b;
}

export function isPositive(n: i32): bool {
  return n > 0;
}

export function createEmptyArray(): i32[] {
  return [];
}
