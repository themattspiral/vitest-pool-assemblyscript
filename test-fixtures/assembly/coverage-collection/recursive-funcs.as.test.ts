/**
 * Recursive function tests
 */

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
import { factorial, gcd, power } from '../../assembly-src/recursive-funcs';

test('factorial 5', () => {
  expect(factorial(5)).toBe(120);
});

test('factorial 10', () => {
  expect(factorial(10)).toBe(3628800);
});

test('gcd of 48 and 18', () => {
  expect(gcd(48, 18)).toBe(6);
});

test('power 2^10', () => {
  expect(power(2, 10)).toBe(1024);
});
