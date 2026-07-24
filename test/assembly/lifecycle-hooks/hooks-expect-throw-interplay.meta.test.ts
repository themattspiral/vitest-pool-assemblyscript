import { test, describe, expect, afterEach } from "vitest-pool-assemblyscript/assembly";

// toThrowError + afterEach interplay: the throw-expectation capture state must
// be consumed at each abort, because the afterEach chain re-enters the same
// instance afterwards. Both scenarios are built so a stale expectation would
// change the OUTCOME, not just the message:
//
// 1. A passing toThrowError ends the test body via an internal unwind. The
//    afterEach abort message deliberately contains the expected substring
//    ("intentional") — with stale expectation state it would be swallowed as
//    the "expected" error and the test would wrongly stay passed; correct
//    behavior fails the test with the afterEach's own runtime error.
//
// 2. A genuine WASM trap inside the expected-to-throw callback bypasses the
//    abort import entirely (nothing consumes the expectation there) — the
//    executor-side reset must clear it, or the afterEach's assertion failure
//    would be misclassified as a toThrowError mismatch.

function abortingFn(): void {
  assert(false, "intentional abort for toThrowError");
}

describe("afterEach abort after a passing toThrowError test", () => {
  afterEach(() => {
    assert(false, "intentional teardown failure");
  });

  test("toThrowError passes, then the afterEach abort fails the test [should fail]", () => {
    expect(() => { abortingFn(); }).toThrowError("intentional");
  });
});

describe("trap inside the expected-to-throw callback", () => {
  afterEach(() => {
    expect(1 + 1).toBe(3);
  });

  test("trap in toThrowError callback fails the test; afterEach failure is classified as its own error [should fail]", () => {
    expect(() => { unreachable(); }).toThrowError("anything");
  });
});
