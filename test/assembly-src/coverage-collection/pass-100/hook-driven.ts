// Functions exercised ONLY from lifecycle hooks (beforeEach/afterEach) in
// pass-100/hooks.test.ts. The 100% coverage threshold on this directory
// enforces that hooks actually execute them: prepareValue proves the
// beforeEach path, and recordTeardown proves the afterEach path (afterEach
// effects aren't observable from inside the test's own instance, but its
// coverage hits are).

export function prepareValue(base: i32): i32 {
  return base * 2 + 1;
}

export function recordTeardown(state: i32): i32 {
  return state - 1;
}
