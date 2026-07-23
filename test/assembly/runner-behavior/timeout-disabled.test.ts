import { test, describe, expect, beforeEach, afterEach, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { busyWork } from "../../assembly-src/timeout-disabled";

// vitest treats a timeout of 0 as "no timeout" - 0 must disable enforcement
// rather than act as an immediate deadline.
//
// Each case does enough work that a window armed at 0 ms would always fire
// first, so passing proves the window was never armed. The test-timeout case
// covers both windows opened with the test's own timeout: the init window armed
// at execution start, and the test fn's own phase window.

const BUSY_ITERATIONS: i32 = 50_000_000;

test("a test timeout of 0 disables the test timeout", TestOptions.timeout(0), () => {
  expect(busyWork(BUSY_ITERATIONS)).toBeGreaterThan(0);
});

describe("a beforeEach timeout of 0", () => {
  beforeEach(() => {
    busyWork(BUSY_ITERATIONS);
  }, 0);

  test("disables that hook's timeout", () => {
    expect(1).toBe(1);
  });
});

describe("an afterEach timeout of 0", () => {
  afterEach(() => {
    busyWork(BUSY_ITERATIONS);
  }, 0);

  test("disables that hook's timeout", () => {
    expect(1).toBe(1);
  });
});
