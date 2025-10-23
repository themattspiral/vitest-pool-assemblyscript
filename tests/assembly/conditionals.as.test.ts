/**
 * Conditional logic tests
 */

import { test, assert } from '../../assembly';

function max(a: i32, b: i32): i32 {
  return a > b ? a : b;
}

function min(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

function abs(n: i32): i32 {
  return n < 0 ? -n : n;
}

test('max function', () => {
  assert(max(5, 3) == 5);
  assert(max(2, 8) == 8);
  assert(max(-5, -10) == -5);
});

test('min function', () => {
  assert(min(5, 3) == 3);
  assert(min(2, 8) == 2);
  assert(min(-5, -10) == -10);
});

test('abs function', () => {
  assert(abs(5) == 5);
  assert(abs(-5) == 5);
  assert(abs(0) == 0);
});

test('nested ternary', () => {
  const val = 15;
  const result = val > 20 ? 1 : val > 10 ? 2 : 3;
  assert(result == 2);
});
