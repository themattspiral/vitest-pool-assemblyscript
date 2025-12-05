/**
 * Recursive function implementations
 */

export function factorial(n: i32): i32 {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

export function gcd(a: i32, b: i32): i32 {
  if (b == 0) return a;
  return gcd(b, a % b);
}

export function power(base: i32, exp: i32): i32 {
  if (exp == 0) return 1;
  if (exp == 1) return base;
  return base * power(base, exp - 1);
}
