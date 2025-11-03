/**
 * Bitwise utility functions
 * Helper functions for bitwise operations
 */

export function bitwiseAnd(a: i32, b: i32): i32 {
  return a & b;
}

export function bitwiseOr(a: i32, b: i32): i32 {
  return a | b;
}

export function bitwiseXor(a: i32, b: i32): i32 {
  return a ^ b;
}

export function leftShift(value: i32, bits: i32): i32 {
  return value << bits;
}

export function rightShift(value: i32, bits: i32): i32 {
  return value >> bits;
}
