/**
 * Array operations tests
 */

import { test, assert } from '../../assembly';
import { arraySum, filterEvens, reverseArray } from '../assembly-src/array-utils';

test('array sum', () => {
  const arr: i32[] = [1, 2, 3, 4, 5];
  const sum: i32 = arraySum(arr);
  assert(sum == 15);
});

test('array filter evens', () => {
  const arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8];
  const evens: i32[] = filterEvens(arr);
  assert(evens.length == 4);
  assert(evens[0] == 2);
  assert(evens[3] == 8);
});

test('array reverse', () => {
  const arr: i32[] = [1, 2, 3, 4, 5];
  const reversed: i32[] = reverseArray(arr);
  assert(reversed[0] == 5);
  assert(reversed[4] == 1);
});
