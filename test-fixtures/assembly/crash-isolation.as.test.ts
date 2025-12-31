/**
 * Crash isolation test suite
 * Verifies that one test crashing doesn't kill subsequent tests
 */

import { test, assert, TestOptions, it } from '../../assembly';
import { safeAdd } from '../assembly-src/crash-test-utils';

it("first test passes", () => {
  assert(true, "first test should pass");
}, TestOptions.timeout(300).retry(5));

it("second test crashes [should fail]", TestOptions.timeout(300).retry(5), () => {
  assert(false, "ASSERT_ERROR@14:3 this assertion should cause abort");
});

it("third test should still run", () => {
  const sum = safeAdd(1, 1);
  assert(sum == 2, "third test should execute despite second test crashing");
});

test("fourth test should also run", () => {
  assert(true, "fourth test should execute");
});
