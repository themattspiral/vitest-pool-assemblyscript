// Source for the "a timeout of 0 disables enforcement" tests.
//
// The work has to outlast a main-thread window armed at 0 ms. A case that
// still completes then proves the window was never armed, rather than merely
// having won a race against an immediate deadline.

export function busyWork(iterations: i32): i32 {
  let accumulated: i32 = 0;

  for (let i: i32 = 0; i < iterations; i++) {
    accumulated += i & 1;
  }

  return accumulated;
}
