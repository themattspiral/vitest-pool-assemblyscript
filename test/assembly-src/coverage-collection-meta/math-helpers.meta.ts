/**
 * Simple math functions for partial coverage testing.
 * Tests import only some of these — divide and negate are left uncalled.
 */

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function subtract(a: i32, b: i32): i32 {
  return a - b;
}

export function multiply(a: i32, b: i32): i32 {
  return a * b;
}

export function divide(a: i32, b: i32): i32 {
  return a / b;
}

export function negate(a: i32): i32 {
  return -a;
}
