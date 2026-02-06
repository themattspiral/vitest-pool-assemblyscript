/**
 * Memory operations tests
 */

import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { createAndFillArray, createLargeArray, createMultipleArrays } from "../../assembly-src/memory-utils";

test("array allocation", () => {
  const arr = createAndFillArray(100);
  expect(arr[50]).toBe(50);
  expect(arr[99]).toBe(99);
});

test("large array", () => {
  const arr = createLargeArray(10000, 1, 9999);
  expect(arr[0]).toBe(1);
  expect(arr[9999]).toBe(9999);
});

test("multiple allocations", () => {
  const arrays = createMultipleArrays(3, 100);
  expect(arrays[0][0]).toBe(1);
  expect(arrays[1][0]).toBe(2);
  expect(arrays[2][0]).toBe(3);
});
