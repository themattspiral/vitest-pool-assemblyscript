/**
 * Source Map Accuracy Test
 *
 * This file tests whether Binaryen coverage instrumentation breaks source map accuracy.
 *
 * Each test deliberately fails at a KNOWN, DOCUMENTED line and column.
 * We'll compare error locations across three modes:
 *   1. coverage: false (baseline - should be perfect)
 *   2. coverage: true (single instrumented - does Binaryen break it?)
 *   3. coverage: 'dual' (current mode - for comparison)
 *
 * EXPECTED ERROR LOCATIONS (for verification):
 * - test_line_25: Line 25, Column 36 (assert call in test file)
 * - test_line_33: Line 33, Column 39 (assert call in test file, indented with 4 spaces)
 * - test_helper_function_error: sourcemap-utils.ts:8 (array bounds in imported helper)
 * - test_nested_helper_error: sourcemap-utils.ts:13 (array bounds in nested imported helper)
 * - test_line_51_multiline: Line 51, Column 3 (assert call starts on 51, false argument on line 52)
 */

import { test, assert } from '../../assembly';
import { helperThatFails, nestedHelperThatFails, outerHelper } from '../assembly-src/sourcemap-utils';


// Test 1: Error at line 25, column 36
test('test_line_25 [should fail]', (): void => { assert(false, 'ASSERT_ERROR@25:36'); });






// Test 2: Error at line 33, column 39 (indented with 4 spaces)
test('test_line_33 [should fail]', (): void => {    assert(false, 'ASSERT_ERROR@33:39'); });





// Test 3: Error in imported helper function (validates cross-file source mapping)
test('test_helper_function_error [should fail]', (): void => {
  helperThatFails(); // RUNTIME_ERROR@41:3 STACK_DEPTH:3 EXPECT_IN:sourcemap-utils.ts:8:17 Out of bounds
});

// Test 4: Error in nested imported helper (validates nested call stack source mapping)
test('test_nested_helper_error [should fail]', (): void => {
  outerHelper(); // RUNTIME_ERROR@46:3 STACK_DEPTH:4 EXPECT_IN:sourcemap-utils.ts:13:17 Out of bounds
});

// Test 5: Multi-line assert (assert on line 51, false argument on line 52)
test('test_line_51_multiline [should fail]', (): void => {
  assert(
    false,
    'ASSERT_ERROR@51:3'
  );
});
