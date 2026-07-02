/**
 * Has a function named "calculate" that adds.
 * Tests same-named functions tracked independently across files.
 */

export function calculate(a: i32, b: i32): i32 {
  return a + b;
}

export function onlyInA(): i32 {
  return 100;
}
