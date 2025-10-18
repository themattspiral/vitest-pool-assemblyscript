// Second AssemblyScript test file for parallelization testing

// Declare the coverage trace function (injected by transform)
@external("env", "__coverage_trace")
declare function __coverage_trace(funcIdx: i64, blockIdx: i64): void;

/**
 * Subtract function
 */
export function subtract(a: i32, b: i32): i32 {
  return a - b;
}

/**
 * Divide function
 */
export function divide(a: i32, b: i32): i32 {
  if (b === 0) {
    return 0; // Handle divide by zero
  }
  return a / b;
}
