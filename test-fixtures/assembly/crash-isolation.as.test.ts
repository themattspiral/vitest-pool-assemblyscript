/**
 * Crash isolation test suite
 * Verifies that one test crashing doesn't kill subsequent tests
 */

import { test, assert } from '../../assembly';
import { skip, testWith, TestOptions } from '../../assembly/test-with-api';
import { safeAdd } from '../assembly-src/crash-test-utils';

test("first test passes", () => {
  assert(true, "first test should pass");
});

testWith("second test crashes [should fail]", TestOptions.timeout(300).retry(5), () => {
  assert(false, "ASSERT_ERROR@14:3 this assertion should cause abort");
});

test("third test should still run", () => {
  const sum = safeAdd(1, 1);
  assert(sum == 2, "third test should execute despite second test crashing");
});

skip("fourth test should also run", () => {
  assert(true, "fourth test should execute");
});
