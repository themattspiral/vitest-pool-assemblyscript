/**
 * Utilities for testing @inline decorator behavior
 */

// Function WITH @inline decorator
// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
export function addInlined(a: i32, b: i32): i32 {
  return a + b;
}

// Function WITHOUT @inline decorator
export function addNormal(a: i32, b: i32): i32 {
  return a + b;
}

// Another @inline function
// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
export function multiplyInlined(a: i32, b: i32): i32 {
  return a * b;
}

// Another normal function
export function multiplyNormal(a: i32, b: i32): i32 {
  return a * b;
}

// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
export function throwsError(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}
