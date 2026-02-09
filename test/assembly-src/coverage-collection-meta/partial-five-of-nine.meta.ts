/**
 * 9 functions, 5 tested — target ~55.56% function coverage.
 * Produces a non-whole-number coverage percentage for summary reporting.
 */

export function double(value: i32): i32 {
  return value * 2;
}

export function triple(value: i32): i32 {
  return value * 3;
}

export function square(value: i32): i32 {
  return value * value;
}

export function cube(value: i32): i32 {
  return value * value * value;
}

export function halve(value: i32): i32 {
  return value / 2;
}

export function remainder(a: i32, b: i32): i32 {
  return a % b;
}

export function sumOfSquares(a: i32, b: i32): i32 {
  return a * a + b * b;
}

export function difference(a: i32, b: i32): i32 {
  return a > b ? a - b : b - a;
}

export function average(a: i32, b: i32): i32 {
  return (a + b) / 2;
}
