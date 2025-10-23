/**
 * Edge case tests
 */

import { test, assert } from '../../assembly';

test('zero handling', () => {
  assert(0 + 0 == 0);
  assert(0 * 100 == 0);
  assert(0 - 0 == 0);
});

test('negative numbers', () => {
  assert(-5 + 3 == -2);
  assert(-10 * -2 == 20);
  assert(-15 / 3 == -5);
});

test('large numbers', () => {
  const large: i32 = 2147483647; // i32 max
  assert(large > 0);
  assert(large - 1 < large);
});

test('empty array', () => {
  const arr: i32[] = [];
  assert(arr.length == 0);
});
