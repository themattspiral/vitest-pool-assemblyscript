import { test, expect, beforeEach, afterEach, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { infiniteLoop, simpleFunc } from "../../assembly-src/timeout-scenarios.meta";

// Hooks inside the non-isolated batch (as-pool-meta-no-isolate project). A
// timing-out test carries the same per-phase timeout records that hooks
// introduce, so the timeout -> abort -> batch-resume path must still run hooks
// around the remaining tests. The post-timeout test's beforeEach assertion is
// the differentiator: if hooks did NOT re-run on the resumed dispatch, `counter`
// stays 0 and that test fails. The afterEach console tag also confirms teardown
// runs for the passing tests in the batch (and, per timeout semantics, NOT for
// the timed-out one — its thread is killed before afterEach).
//
// This file also puts a SECOND timing-out test in the batch (alongside
// batch-timeout), which regression-guards the multi-timeout resume: the pool
// must finalize each timed-out file and skip it on subsequent resumes rather
// than re-dispatch it (which would loop forever).

let counter: i32 = 0;

beforeEach(() => {
  counter++;
});

afterEach(() => {
  console.log("bh:after-ran");
});

test("batch-hooks pre-timeout passing test", () => {
  expect(counter).toBe(1); // fresh instance: beforeEach ran exactly once
  expect(simpleFunc()).toBe(42);
});

test("batch-hooks timeout [should fail]", TestOptions.timeout(100), () => {
  infiniteLoop();
});

test("batch-hooks post-timeout passing test", () => {
  expect(counter).toBe(1); // beforeEach re-ran on the resumed dispatch, in a fresh instance
  expect(simpleFunc()).toBe(42);
});
