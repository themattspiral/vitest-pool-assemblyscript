/**
 * Crash isolation test suite
 * Verifies that one test crashing doesn't kill subsequent tests
 */

import { test, assert } from '../assembly';

test("first test passes", () => {
  assert(true, "first test should pass");
});

test("second test crashes", () => {
  assert(false, "this assertion fails and causes abort");
});

test("third test should still run", () => {
  const sum: i32 = 1 + 1;
  assert(sum == 2, "third test should execute despite second test crashing");
});

test("fourth test should also run", () => {
  assert(true, "fourth test should execute");
});
