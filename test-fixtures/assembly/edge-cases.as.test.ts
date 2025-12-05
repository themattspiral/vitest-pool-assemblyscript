/**
 * Edge case tests
 */

import { test, assert } from '../../assembly';
import { addZeros, multiplyByZero, addNegatives, multiplyNegatives, divideNegative, isPositive, createEmptyArray } from '../assembly-src/edge-case-utils';

test('zero handling', () => {
  assert(addZeros(0, 0) == 0);
  assert(multiplyByZero(100) == 0);
  assert(addZeros(0, 0) == 0);
});

test('negative numbers', () => {
  assert(addNegatives(-5, 3) == -2);
  assert(multiplyNegatives(-10, -2) == 20);
  assert(divideNegative(-15, 3) == -5);
});

test('large numbers', () => {
  const large: i32 = 2147483647; // i32 max
  assert(isPositive(large));
  assert(large - 1 < large);
});

test('empty array', () => {
  const arr = createEmptyArray();
  assert(arr.length == 0);
});
