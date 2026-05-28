/**
 * Utilities for testing inline decorator failure behavior
 */

// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
export function inlineFails(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}
