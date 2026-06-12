import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { simpleFunc } from "../../assembly-src/timeout-scenarios.meta";
import { add } from "../../assembly-src/quick-math";

// Part of the non-isolated batch scenario (as-pool-meta-no-isolate project):
// all *.meta-no-isolate files are sent to one PoolWorker in a single run message.
//
// This is one of two all-passing files batched alongside batch-timeout. Dispatch
// order within the batch is sequencer-dependent, so each passing file must complete
// with intact results whether it runs before the timeout abort (results preserved,
// not re-run on resume) or after it (still runs on the resumed dispatch).

test("batch pass-a: simple passing test", () => {
  expect(simpleFunc()).toBe(42);
});

test("batch pass-a: another passing test", () => {
  expect(add(2, 3)).toBe(5);
});
