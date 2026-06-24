/**
 * Function-shape discovery for the 100% passing set: plain, nested, arrow,
 * braceless arrow, multi-declarator function expressions, callbacks (higher-order),
 * recursion, and a monomorphized generic. Every function is exercised by
 * pass-100/functions.test.ts, so the file reaches 100% on all four coverage types.
 */

// Plain function.
export function square(n: i32): i32 {
  return n * n;
}

// Nested function declaration.
export function withNested(n: i32): i32 {
  function increment(x: i32): i32 {
    return x + 1;
  }
  return increment(n) * 2;
}

// Module-level arrow (extracted as a variable-declarator initializer).
const triple = (n: i32): i32 => n * 3;

export function useArrow(n: i32): i32 {
  return triple(n);
}

// Braceless arrow + a block arrow declared together in one multi-declarator const.
const addOne = (n: i32): i32 => n + 1,
  doubleIt = (n: i32): i32 => { return n * 2; };

export function useMultiDeclarator(n: i32): i32 {
  return addOne(doubleIt(n));
}

// Higher-order function taking a callback, exercised with a named and an anonymous fn.
export function applyTwice(n: i32, fn: (x: i32) => i32): i32 {
  return fn(fn(n));
}

export function useNamedCallback(n: i32): i32 {
  return applyTwice(n, square);
}

export function useAnonCallback(n: i32): i32 {
  return applyTwice(n, (x: i32) => x + 10);
}

// Recursion — both arms of the base-case branch are taken when called with n >= 2.
export function factorial(n: i32): i32 {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

// Generic — i32 and f64 specializations sum into this one source function.
export function identity<T>(value: T): T {
  return value;
}
