import { test, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";
import { calledFromBeforeEach, calledFromAfterEach } from "../../assembly-src/coverage-collection/function/hook-attribution.meta";

// Coverage attribution for lifecycle hook imported source functions (meta run):
// each hook calls an instrumented source function once per test, so with two passing tests
// both functions read exactly 2 hits (asserted in meta-verify), while the never-called sibling stays at 0.

let prepared: i32 = 0;

beforeEach(() => {
  prepared = calledFromBeforeEach(10);
});

afterEach(() => {
  prepared = calledFromAfterEach(prepared);
});

test("first test drives hook-called coverage", () => {
  expect(prepared).toBe(11);
});

test("second test drives hook-called coverage again", () => {
  expect(prepared).toBe(11);
});
