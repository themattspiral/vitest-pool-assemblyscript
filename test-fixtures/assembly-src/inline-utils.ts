/**
 * Utilities for testing @inline decorator behavior
 */

import { addInlinedExternalFile } from './inline-utils-external';

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
const multiplyArrowInlined = (a: i32, b: i32): i32 => {
  return a * b;
};

export function multiplyWithInternalInlining(a: i32, b: i32): i32 {
  return multiplyArrowInlined(a, b);
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

export function callsInlinedAdd(a: i32, b: i32): i32 {
  const res = addInlinedExternalFile(a, b);
  return res;
}
