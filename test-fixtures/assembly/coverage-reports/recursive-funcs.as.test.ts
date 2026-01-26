/**
 * Recursive function tests
 */

import { test, assert } from '../../../assembly';
import { factorial, gcd, power } from '../../assembly-src/recursive-funcs';

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
