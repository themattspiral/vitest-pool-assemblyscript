// Called ONLY from lifecycle hooks in hooks-attribution.meta.test.ts — pins
// that instrumented source functions invoked from beforeEach/afterEach count
// normally and attribute to the triggering test's file.

export function calledFromBeforeEach(v: i32): i32 {
  return v + 1;
}

export function calledFromAfterEach(v: i32): i32 {
  return v * 2;
}

export function neverCalledFromHooks(v: i32): i32 {
  return v - 1;
}
