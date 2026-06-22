/**
 * Functions called a precise number of times for hit count verification.
 * neverCalled is present but never invoked by any test.
 */

export function calledOnce(): i32 {
  return 1;
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
