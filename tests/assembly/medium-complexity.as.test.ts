/**
 * Medium complexity tests - moderate number with moderate execution time
 * Represents typical test workload
 */

import { test, assert } from '../../assembly';

function bubbleSort(arr: i32[]): void {
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        const temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
}

function binarySearch(arr: i32[], target: i32): i32 {
  let left = 0;
  let right = arr.length - 1;
  while (left <= right) {
    const mid = (left + right) / 2;
    if (arr[mid] == target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}

test('bubble sort 100 elements', () => {
  const arr: i32[] = [];
  for (let i = 0; i < 100; i++) {
    arr.push(100 - i);
  }
  bubbleSort(arr);
  assert(arr[0] == 1);
  assert(arr[99] == 100);
});

test('binary search finds element', () => {
  const arr: i32[] = [1, 3, 5, 7, 9, 11, 13, 15];
  assert(binarySearch(arr, 7) == 3);
  assert(binarySearch(arr, 15) == 7);
  assert(binarySearch(arr, 1) == 0);
});

test('binary search returns -1 for missing', () => {
  const arr: i32[] = [1, 3, 5, 7, 9];
  assert(binarySearch(arr, 4) == -1);
  assert(binarySearch(arr, 10) == -1);
});

test('bubble sort 500 elements', () => {
  const arr: i32[] = [];
  for (let i = 0; i < 500; i++) {
    arr.push(500 - i);
  }
  bubbleSort(arr);
  assert(arr[0] == 1);
  assert(arr[250] == 251);
  assert(arr[499] == 500);
});

test('bubble sort 1000 elements', () => {
  const arr: i32[] = [];
  for (let i = 0; i < 1000; i++) {
    arr.push(1000 - i);
  }
  bubbleSort(arr);
  assert(arr[0] == 1);
  assert(arr[500] == 501);
  assert(arr[999] == 1000);
});
