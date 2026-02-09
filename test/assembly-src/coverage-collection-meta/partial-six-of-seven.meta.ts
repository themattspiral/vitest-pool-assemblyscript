/**
 * 7 functions, 6 tested — target ~85.71% function coverage.
 * Produces a non-whole-number coverage percentage for summary reporting.
 */

export function factorial(n: i32): i32 {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

export function fibonacci(n: i32): i32 {
  if (n <= 0) return 0;
  if (n == 1) return 1;
  let a: i32 = 0;
  let b: i32 = 1;
  for (let i: i32 = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

export function power(base: i32, exp: i32): i32 {
  let result: i32 = 1;
  for (let i: i32 = 0; i < exp; i++) {
    result *= base;
  }
  return result;
}

export function sumRange(start: i32, end: i32): i32 {
  let total: i32 = 0;
  for (let i = start; i <= end; i++) {
    total += i;
  }
  return total;
}

export function gcd(a: i32, b: i32): i32 {
  while (b != 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

export function lcm(a: i32, b: i32): i32 {
  return (a / gcd(a, b)) * b;
}

export function triangleNumber(n: i32): i32 {
  return (n * (n + 1)) / 2;
}
