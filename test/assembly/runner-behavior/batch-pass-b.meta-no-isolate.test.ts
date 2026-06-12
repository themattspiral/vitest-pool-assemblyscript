import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { simpleFunc } from "../../assembly-src/timeout-scenarios.meta";
import { double } from "../../assembly-src/quick-math";

// Part of the non-isolated batch scenario (as-pool-meta-no-isolate project):
// all *.meta-no-isolate files are sent to one PoolWorker in a single run message.
//
// Second all-passing file — see batch-pass-a for the scenario description.
// Three files ensure that wherever the sequencer places the timeout file,
// at least one other file sits before or after it in the batch.

test("batch pass-b: simple passing test", () => {
  expect(simpleFunc()).toBe(42);
});

test("batch pass-b: another passing test", () => {
  expect(double(21)).toBe(42);
});
