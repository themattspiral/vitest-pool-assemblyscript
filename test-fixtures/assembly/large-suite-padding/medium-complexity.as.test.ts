/**
 * Medium complexity tests - moderate number with moderate execution time
 * Represents typical test workload
 */

import { test, expect } from '../../../assembly';
import { bubbleSort, binarySearch } from '../../assembly-src/sorting-utils';

test('bubble sort 100 elements', () => {
  const arr: i32[] = [];
  for (let i = 0; i < 100; i++) {
    arr.push(100 - i);
  }
  bubbleSort(arr);
  expect(arr[0]).toBe(1);
  expect(arr[99]).toBe(100);
});

test('binary search finds element', () => {
  const arr: i32[] = [1, 3, 5, 7, 9, 11, 13, 15];
  expect(binarySearch(arr, 7)).toBe(3);
  expect(binarySearch(arr, 15)).toBe(7);
  expect(binarySearch(arr, 1)).toBe(0);
});

test('binary search returns -1 for missing', () => {
  const arr: i32[] = [1, 3, 5, 7, 9];
  expect(binarySearch(arr, 4)).toBe(-1);
  expect(binarySearch(arr, 10)).toBe(-1);
});

test('bubble sort 500 elements', () => {
  const arr: i32[] = [];
  for (let i = 0; i < 500; i++) {
    arr.push(500 - i);
  }
  bubbleSort(arr);
  expect(arr[0]).toBe(1);
  expect(arr[250]).toBe(251);
  expect(arr[499]).toBe(500);
});

test('bubble sort 1000 elements', () => {
  const arr: i32[] = [];
  for (let i = 0; i < 1000; i++) {
    arr.push(1000 - i);
  }
  bubbleSort(arr);
  expect(arr[0]).toBe(1);
  expect(arr[500]).toBe(501);
  expect(arr[999]).toBe(1000);
});
