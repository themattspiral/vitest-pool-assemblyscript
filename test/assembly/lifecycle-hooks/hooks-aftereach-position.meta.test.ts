import { test, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";

// afterEach position-independence + state observation. The afterEach is
// registered at the BOTTOM of this file, after the test it applies to, yet it
// still runs for that test (suite-scoped, position-independent). The beforeEach
// side of this is pinned in-band by hooks-ordering.test.ts; afterEach effects
// die with the instance, so it's pinned out-of-band here.
//
// The hook asserts it observed the module state written by beforeEach + the
// body (state sharing), then console-tags. meta-verify confirms the tag
// appeared — which means the hook ran AND its assertion passed (had it not run,
// no tag; had it observed wrong state, the expect would abort before the tag
// and fail the test). This is a passing fixture in the meta suite (like
// hooks-order-output) so its captured output can be asserted.

let value: i32 = 0;

beforeEach(() => {
  value = 10;
});

test("afterEach registered below still applies to this test", () => {
  value += 5;
  expect(value).toBe(15);
});

// registered AFTER the test above — still runs for it
afterEach(() => {
  // observes beforeEach's write (10) plus the body's write (5)
  expect(value).toBe(15);
  console.log("pos:after-ran-and-saw-15");
});
