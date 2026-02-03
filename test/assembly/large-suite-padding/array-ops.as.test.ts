/**
 * Array operations tests
 */

import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { arraySum, filterEvens, reverseArray } from "../../assembly-src/array-utils";

test("array sum", () => {
  const arr: i32[] = [1, 2, 3, 4, 5];
  const sum: i32 = arraySum(arr);
  expect(sum).toBe(15);
});

test("array filter evens", () => {
  const arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8];
  const evens: i32[] = filterEvens(arr);
  expect(evens.length).toBe(4);
  expect(evens[0]).toBe(2);
  expect(evens[3]).toBe(8);
});

test("array reverse", () => {
  const arr: i32[] = [1, 2, 3, 4, 5];
  const reversed: i32[] = reverseArray(arr);
  expect(reversed[0]).toBe(5);
  expect(reversed[4]).toBe(1);
});
