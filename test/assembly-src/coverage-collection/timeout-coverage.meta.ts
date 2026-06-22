// Coverage source for timeout coverage preservation scenario.
// Tests verify that coverage from tests before/after a timeout is preserved,
// while coverage from the timed-out test itself is lost.
//
// The test file uses a nested suite structure to verify coverage preservation
// across completed sibling suites, within the same suite as the timeout,
// and in nested subsuites that complete before or run after the timeout.

// Called in a sibling suite that completes before the timeout suite runs
export function completedSiblingFunc(): i32 {
  return 10;
}

// Called in a nested subsuite that completes before the timeout test
export function nestedBeforeFunc(): i32 {
  return 20;
}

// Called in a test in the same suite as the timeout, before it
export function beforeTimeout(): i32 {
  return 1;
}

// Called inside the timeout test — coverage lost when thread killed
export function duringTimeout(): i32 {
  return 2;
}

// Called in a test in the same suite as the timeout, after resume
export function afterTimeout(): i32 {
  return 3;
}

// Called in a nested subsuite that runs after the timeout resume
export function nestedAfterFunc(): i32 {
  return 30;
}
