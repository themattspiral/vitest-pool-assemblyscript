/**
 * Memory operations tests
 */

import { test, assert } from '../../assembly';

test('array allocation', () => {
  const arr = new Array<i32>(100);
  for (let i = 0; i < 100; i++) {
    arr[i] = i;
  }
  assert(arr[50] == 50);
  assert(arr[99] == 99);
});

test('large array', () => {
  const arr = new Array<i32>(10000);
  arr[0] = 1;
  arr[9999] = 9999;
  assert(arr[0] == 1);
  assert(arr[9999] == 9999);
});

test('multiple allocations', () => {
  const arr1 = new Array<i32>(100);
  const arr2 = new Array<i32>(100);
  const arr3 = new Array<i32>(100);
  arr1[0] = 1;
  arr2[0] = 2;
  arr3[0] = 3;
  assert(arr1[0] == 1);
  assert(arr2[0] == 2);
  assert(arr3[0] == 3);
});
