// Simple AssemblyScript test file for POC

// Declare the coverage trace function (injected by transform)
@external("env", "__coverage_trace")
declare function __coverage_trace(funcIdx: i64, blockIdx: i64): void;

/**
 * Basic addition function to test
 */
export function add(a: i32, b: i32): i32 {
  return a + b;
}

/**
 * Basic multiplication function to test
 */
export function multiply(a: i32, b: i32): i32 {
  return a * b;
}
