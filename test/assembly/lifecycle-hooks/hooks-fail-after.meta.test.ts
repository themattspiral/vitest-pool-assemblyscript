import { test, describe, expect, afterEach } from "vitest-pool-assemblyscript/assembly";

// afterEach failure semantics (vitest parity): a failing afterEach fails a
// PASSED test and stops the remaining after-chain. Within one suite, hooks run
// in REVERSE registration order (vitest's default sequence.hooks 'stack'), so
// the first-registered hook runs last — and never runs when a later-registered
// one fails first. Also pins: afterEach still runs after a test-fn failure and
// after a genuine WASM trap, and appends a second error to a failed test.

describe("failing afterEach flips a passed test", () => {
  afterEach(() => {
    // registered first → runs LAST (stack order) — the chain stops before it
    console.log("fa:after-1-should-not-run");
  });

  afterEach(() => {
    console.log("fa:after-2-ran");
    expect(2 + 2).toBe(5); // fails the (passed) test from afterEach
  });

  test("passes in the body, fails in afterEach [should fail]", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("afterEach still runs after a test-fn failure", () => {
  afterEach(() => {
    console.log("taf:after-ran");
  });

  test("failing body still triggers afterEach [should fail]", () => {
    expect(true).toBeFalsy();
  });
});

describe("afterEach still runs after a genuine WASM trap", () => {
  afterEach(() => {
    console.log("trap:after-ran");
  });

  test("trapping body still triggers afterEach [should fail]", () => {
    unreachable();
  });
});

describe("hook failure after test failure appends a second error", () => {
  afterEach(() => {
    expect(10).toBe(11); // second error on an already-failed test
  });

  test("both the body error and the afterEach error land on the test [should fail]", () => {
    expect(1).toBe(2);
  });
});
