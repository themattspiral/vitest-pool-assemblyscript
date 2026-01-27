/**
 * Crash isolation test suite
 * Verifies that one test crashing doesn't kill subsequent tests
 */

import { test, expect, TestOptions, it } from '../../../assembly';
import { safeAdd } from '../../assembly-src/crash-test-utils';

it("first test passes", () => {
  expect(true).toBeTruthy();
}, TestOptions.timeout(300).retry(5));

// ASSERT_ERROR@14:3
it("second test crashes [should fail]", TestOptions.retry(2), () => {
  expect(false).toBeTruthy();
});

it("third test should still run", () => {
  const sum = safeAdd(1, 1);
  expect(sum).toBe(2);
});

test("fourth test should also run", () => {
  expect(true).toBeTruthy();
});
