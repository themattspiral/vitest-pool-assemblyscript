/**
 * Simple AssemblyScript math functions for hybrid coverage POC
 */

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function multiply(a: i32, b: i32): i32 {
  return a * b;
}

// This function won't be called - should show 0% coverage
export function unused(): i32 {
  return 42;
}
