/**
 * Conditional utility functions
 * Helper functions demonstrating conditional logic
 */

export function max(a: i32, b: i32): i32 {
  return a > b ? a : b;
}

export function min(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

export function abs(n: i32): i32 {
  return n < 0 ? -n : n;
}

export function categorize(val: i32): i32 {
  return val > 20 ? 1 : val > 10 ? 2 : 3;
}
