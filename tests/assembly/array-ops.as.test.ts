/**
 * Array operations tests
 */

import { test, assert } from '../../assembly';

test('array sum', () => {
  const arr: i32[] = [1, 2, 3, 4, 5];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  assert(sum == 15);
});

test('array filter evens', () => {
  const arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8];
  const evens: i32[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] % 2 == 0) evens.push(arr[i]);
  }
  assert(evens.length == 4);
  assert(evens[0] == 2);
  assert(evens[3] == 8);
});

test('array reverse', () => {
  const arr: i32[] = [1, 2, 3, 4, 5];
  arr.reverse();
  assert(arr[0] == 5);
  assert(arr[4] == 1);
});
