/**
 * String utilities test suite
 * Tests string operations from imported module
 */

import { test, assert } from '../src/framework';
import { getLength, isEmpty, concat, repeat } from './string-utils';

test("getLength returns string length", () => {
  assert(getLength("hello") == 5, "hello has 5 characters");
  assert(getLength("") == 0, "empty string has 0 characters");
});

test("isEmpty checks for empty strings", () => {
  assert(isEmpty(""), "empty string is empty");
  assert(!isEmpty("test"), "test is not empty");
});

test("concat concatenates strings", () => {
  const result = concat("hello", "world");
  assert(result == "helloworld", "should concatenate strings");
});

test("repeat repeats strings", () => {
  const result = repeat("ab", 3);
  assert(result == "ababab", "should repeat string 3 times");
});
