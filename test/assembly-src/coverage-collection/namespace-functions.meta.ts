/**
 * Namespace coverage verification.
 * Tests whether functions inside namespaces are discovered
 * and what naming convention they use in coverage.
 */

export namespace MathUtils {
  export function square(x: i32): i32 {
    return x * x;
  }

  export function cube(x: i32): i32 {
    return x * x * x;
  }

  export function unused(x: i32): i32 {
    return x;
  }
}

/** Top-level function for comparison */
export function topLevel(x: i32): i32 {
  return x + 1;
}
