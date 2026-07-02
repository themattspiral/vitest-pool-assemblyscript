/**
 * Nested function declarations and a non-capturing arrow function assigned to a
 * module-level constant. AssemblyScript has no JS-style closures, so neither form
 * captures an enclosing local. Verifies both are discovered and counted in coverage.
 */

// Module-level arrow function (no capture). The AST parser extracts arrow functions
// from variable-declarator initializers.
const triple = (x: i32): i32 => x * 3;

export function useTriple(n: i32): i32 {
  return triple(n);
}

// A function declared inside another function.
export function withNested(x: i32): i32 {
  function increment(y: i32): i32 {
    return y + 1;
  }
  return increment(x) * 2;
}
