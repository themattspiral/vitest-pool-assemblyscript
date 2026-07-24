import { test, expect, beforeEach, TestOptions } from "vitest-pool-assemblyscript/assembly";

// Hooks re-run around EVERY attempt (vitest semantics), each attempt in a
// fresh WASM instance: module-level state is re-initialized per attempt, so
// the beforeEach counter is always exactly 1 no matter which attempt runs.

let beforeEachRuns: i32 = 0;

beforeEach(() => {
  beforeEachRuns++;
});

test("beforeEach re-runs in a fresh instance on every retry attempt", TestOptions.retry(2), (retryCount: i32) => {
  expect(beforeEachRuns).toBe(1);
  // attempts 0 and 1 fail here, so the test passes only on the final attempt —
  // proving the hook ran (exactly once) for each of the three attempts
  expect(retryCount).toBeGreaterThanOrEqual(2);
});
