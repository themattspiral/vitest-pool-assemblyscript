/**
 * Test file for coverage instrumentation
 *
 * This file contains simple functions to verify:
 * 1. Coverage trace injection works
 * 2. Debug info mapping is correct
 * 3. Traces are collected during execution
 */

// Declare the coverage trace function that will be imported from JS
// Using @external decorator to specify the import module name
// Note: Using i64 because IntegerLiteralExpression creates i64 values
@external("env", "__coverage_trace")
declare function __coverage_trace(funcIdx: i64, blockIdx: i64): void;

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function multiply(a: i32, b: i32): i32 {
  return a * b;
}

export function subtract(a: i32, b: i32): i32 {
  return a - b;
}

export function divide(a: i32, b: i32): i32 {
  return a / b;
}

// Test that calls multiple functions to verify trace collection
export function runTests(): void {
  add(1, 2);
  multiply(3, 4);
  subtract(10, 5);
  divide(20, 4);
}
