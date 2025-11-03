/**
 * General utility functions
 */

export function clamp(value: i32, min: i32, max: i32): i32 {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a: f32, b: f32, t: f32): f32 {
  return a + (b - a) * t;
}

export function isEven(n: i32): bool {
  return n % 2 == 0;
}

export function isOdd(n: i32): bool {
  return n % 2 != 0;
}
