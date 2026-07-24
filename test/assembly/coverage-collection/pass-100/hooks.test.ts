import { test, describe, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";
import { prepareValue, recordTeardown } from "../../../assembly-src/coverage-collection/pass-100/hook-driven";

// Coverage attribution for lifecycle hooks: instrumented source functions
// called from hooks count normally and attribute to the triggering test.
// recordTeardown is called ONLY from afterEach — the 100% threshold on this
// directory is the proof that the afterEach chain executes in the passing suite.

let prepared: i32 = 0;
let tornDown: i32 = 0;

beforeEach(() => {
  prepared = prepareValue(20);
});

afterEach(() => {
  tornDown = recordTeardown(prepared);
});

describe("hooks calling instrumented source", () => {
  test("beforeEach-computed value is visible to the test", () => {
    expect(prepared).toBe(41);
  });

  test("fresh instance per test: prepared is recomputed, teardown state is not carried over", () => {
    expect(prepared).toBe(41);
    // the previous test's afterEach ran in ITS instance, not ours
    expect(tornDown).toBe(0);
  });
});
