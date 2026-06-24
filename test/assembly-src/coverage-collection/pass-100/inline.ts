/**
 * @inline coverage for the 100% passing set. Under the default stripInline, the
 * @inline decorators are removed so these compile as real, individually-tracked
 * functions. Covers an @inline function, an @inline arrow, and a cross-file @inline
 * target. Branch-free; the driver calls every export, so 100% on all four types.
 */

import { inlinedFromOtherFile } from './inline-helper';

// @ts-ignore: AS inline decorator
@inline
export function inlinedAdd(a: i32, b: i32): i32 {
  return a + b;
}

export function callsInlinedAdd(a: i32, b: i32): i32 {
  return inlinedAdd(a, b);
}

// @ts-ignore: AS inline decorator
@inline
const inlinedMul = (a: i32, b: i32): i32 => a * b;

export function callsInlinedMul(a: i32, b: i32): i32 {
  return inlinedMul(a, b);
}

export function callsCrossFileInlined(a: i32, b: i32): i32 {
  return inlinedFromOtherFile(a, b);
}
