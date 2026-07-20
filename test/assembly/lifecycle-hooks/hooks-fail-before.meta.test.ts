import { test, describe, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";

// beforeEach failure semantics (vitest parity): a failing beforeEach fails the
// test, stops the remaining before-chain, and skips the test fn — while the
// afterEach chain still runs. Console tags make each behavior observable in
// the captured output (meta-verify).

describe("failing beforeEach assertion", () => {
  beforeEach(() => {
    console.log("fb:before-1-ran");
    expect(1 + 1).toBe(3); // fails the test from the hook
  });

  beforeEach(() => {
    console.log("fb:before-2-should-not-run");
  });

  afterEach(() => {
    console.log("fb:after-ran");
  });

  test("test fn is skipped when beforeEach fails [should fail]", () => {
    console.log("fb:test-fn-should-not-run");
  });
});

describe("runtime error in beforeEach", () => {
  beforeEach(() => {
    const arr = new Array<i32>(1);
    console.log(arr[5].toString()); // out of range access → runtime abort from the hook
  });

  test("runtime hook error fails the test [should fail]", () => {
    console.log("rb:test-fn-should-not-run");
  });
});
