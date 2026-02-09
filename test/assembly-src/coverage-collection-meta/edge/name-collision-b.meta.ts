/**
 * Has a function named "calculate" that multiplies.
 * Tests same-named functions tracked independently across files.
 */

export function calculate(a: i32, b: i32): i32 {
  return a * b;
}

export function onlyInB(): i32 {
  return 200;
}
