/**
 * Same filename as ../math-helpers.meta.ts but in edge/ subdirectory.
 * Has a function named "add" (same as the parent file) plus "edgeOnly".
 * Tests same-named files in different directories tracked independently.
 */

export function add(a: i32, b: i32): i32 {
  return a + b + 1;
}

export function edgeOnly(): i32 {
  return 42;
}
