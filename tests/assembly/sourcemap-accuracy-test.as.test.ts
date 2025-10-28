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
 * - test_line_24: Line 24, Column 35 (assert call)
 * - test_line_32: Line 32, Column 38 (assert call, indented with 4 spaces)
 * - test_line_40_helper: Line 40, Column 42 (in helperFunctionOnLine40)
 * - test_line_48_nested: Line 48, Column 40 (in nestedHelperOnLine48)
 * - test_line_65_expression: Line 65, Column 2 (assert call)
 * - test_line_74_multiline: Line 74, Column 2 (assert call starts on 74, false argument on line 75)
 */

import { test, assert } from '../../assembly';

// Test 1: Error at line 24, column 35
test('test_line_24', (): void => { assert(false, 'ERROR_AT_LINE_24'); });

// Line 25
// Line 26
// Line 27
// Line 28
// Line 29
// Test 2: Error at line 32, column 38 (indented with 4 spaces)
test('test_line_32', (): void => {    assert(false, 'ERROR_AT_LINE_32'); });

// Line 33
// Line 34
// Line 35
// Line 36
// Line 37
// Helper function with error on line 40
function helperFunctionOnLine40(): void { assert(false, 'ERROR_AT_LINE_40'); }

// Test 3: Error in helper function
test('test_line_40_helper', (): void => {
  helperFunctionOnLine40();
});

// Nested helper with error on line 48
function nestedHelperOnLine48(): void { assert(false, 'ERROR_AT_LINE_48'); }

// Outer helper that calls nested
function outerHelperOnLine51(): void {
  nestedHelperOnLine48();
}

// Test 4: Error in nested helper (deeper call stack)
test('test_line_48_nested', (): void => {
  outerHelperOnLine51();
});

// Test 5: Error with complex expression
test('test_line_65_expression', (): void => {
  const result: i32 = (10 + 20) * 2;
  const x: i32 = 1;
  const y: i32 = 2;
  assert(result === 999, 'ERROR_AT_LINE_65');
});

// Line 67
// Line 68
// Line 69
// Line 70
// Test 6: Multi-line assert (assert on line 74, false argument on line 75)
test('test_line_74_multiline', (): void => {
  assert(
    false,
    'ERROR_AT_LINE_74_OR_75_MULTILINE'
  );
});
