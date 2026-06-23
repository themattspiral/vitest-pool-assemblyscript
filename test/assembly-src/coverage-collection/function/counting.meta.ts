/**
 * Function hit-count spectrum for counting coverage: functions called 0, 1, 2, 3,
 * and 5 times; a recursive function (one entry per recursive call); and a
 * monomorphized generic whose specializations sum into one source-function count.
 * Twinned line-for-line by js-coverage-parity-src/function/counting.ts.
 */

export function calledOnce(): i32 {
  return 1;
}

export function calledTwice(): i32 {
  return 2;
}

export function calledThrice(): i32 {
  return 3;
}

export function calledFiveTimes(): i32 {
  return 5;
}

export function neverCalled(): i32 {
  return 0;
}

// Recursion: each call is a fresh function entry, so countdown(4) yields 5 entries.
export function countdown(n: i32): i32 {
  if (n <= 0) {
    return 0;
  }
  return countdown(n - 1);
}

// Monomorphized generic: identity<i32> and identity<f64> are separate binary
// functions whose hits sum into this single source function.
export function identity<T>(value: T): T {
  return value;
}
