/**
 * Memory operations tests
 */

import { test, assert } from '../../assembly';
import { createAndFillArray, createLargeArray, createMultipleArrays } from '../assembly-src/memory-utils';

test('array allocation', () => {
  const arr = createAndFillArray(100);
  assert(arr[50] == 50);
  assert(arr[99] == 99);
});

test('large array', () => {
  const arr = createLargeArray(10000, 1, 9999);
  assert(arr[0] == 1);
  assert(arr[9999] == 9999);
});

test('multiple allocations', () => {
  const arrays = createMultipleArrays(3, 100);
  assert(arrays[0][0] == 1);
  assert(arrays[1][0] == 2);
  assert(arrays[2][0] == 3);
});
