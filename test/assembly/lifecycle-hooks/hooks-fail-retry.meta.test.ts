import { test, describe, expect, beforeEach, afterEach, TestOptions } from "vitest-pool-assemblyscript/assembly";

// A failing hook consumes a retry attempt exactly like a failing test body —
// vitest runs beforeEach/afterEach inside the retry loop, and each attempt is
// a fresh WASM instance, so hooks re-run on every attempt. The console tags
// count attempts; meta-verify asserts one failure message per attempt.

describe("failing beforeEach consumes retry attempts", () => {
  beforeEach(() => {
    console.log("rc:before-attempt");
    expect(1).toBe(2);
  });

  test("beforeEach fails every attempt until retries are exhausted [should fail]", TestOptions.retry(2), () => {
    console.log("rc:test-fn-should-not-run");
  });
});

describe("failing afterEach consumes retry attempts", () => {
  afterEach(() => {
    console.log("rc:after-attempt");
    expect(3).toBe(4);
  });

  test("afterEach fails every attempt after a passing body [should fail]", TestOptions.retry(1), () => {
    console.log("rc:after-body-ran");
    expect(1).toBe(1);
  });
});
