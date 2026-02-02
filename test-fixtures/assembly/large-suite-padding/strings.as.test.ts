/**
 * String utilities test suite
 * Tests string operations from imported module
 */

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
import { getLength, isEmpty, concat, repeat } from '../../assembly-src/string-utils';

test("getLength returns string length", () => {
  expect(getLength("hello")).toBe(5);
  expect(getLength("")).toBe(0);
});

test("isEmpty checks for empty strings", () => {
  expect(isEmpty("")).toBeTruthy();
  expect(isEmpty("test")).toBeFalsey();
});

test("concat concatenates strings", () => {
  const result = concat("hello", "world");
  expect(result).toBe("helloworld");
});

test("repeat repeats strings", () => {
  const result = repeat("ab", 3);
  expect(result).toBe("ababab");
});
