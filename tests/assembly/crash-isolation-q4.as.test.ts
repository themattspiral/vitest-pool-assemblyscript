/**
 * Test file for Q4 crash isolation testing
 *
 * Tests:
 * - test 1: passes
 * - test 2: ABORTS (calls abort())
 * - test 3: passes
 *
 * Question: When running with Promise.all/allSettled, does test 3 execute after test 2 aborts?
 */

import { test, assert } from '../../assembly';

test('crash test 1 - should pass', () => {
  const result: i32 = 1 + 1;
  assert(result == 2, 'math works');
});

test('crash test 2 - INTENTIONAL ABORT - line 20', () => {
  // This will call abort() and crash this test
  assert(false, 'ASSERT_ERROR@21:3 THIS TEST INTENTIONALLY ABORTS TO TEST CRASH ISOLATION');
});

test('crash test 3 - should pass if isolated', () => {
  const result: i32 = 2 + 2;
  assert(result == 4, 'math still works');
});

test('crash test 4 - should pass if isolated', () => {
  const result: i32 = 3 + 3;
  assert(result == 6, 'math continues to work');
});

test('crash test 5 - should pass if isolated', () => {
  const result: i32 = 4 + 4;
  assert(result == 8, 'math keeps working');
});
