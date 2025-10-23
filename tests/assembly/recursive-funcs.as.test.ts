/**
 * Recursive function tests
 */

import { test, assert } from '../../assembly';

function factorial(n: i32): i32 {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function gcd(a: i32, b: i32): i32 {
  if (b == 0) return a;
  return gcd(b, a % b);
}

function power(base: i32, exp: i32): i32 {
  if (exp == 0) return 1;
  if (exp == 1) return base;
  return base * power(base, exp - 1);
}

test('factorial 5', () => {
  assert(factorial(5) == 120);
});

test('factorial 10', () => {
  assert(factorial(10) == 3628800);
});

test('gcd of 48 and 18', () => {
  assert(gcd(48, 18) == 6);
});

test('power 2^10', () => {
  assert(power(2, 10) == 1024);
});
