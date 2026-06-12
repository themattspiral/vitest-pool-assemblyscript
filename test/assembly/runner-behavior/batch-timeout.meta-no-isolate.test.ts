import { test, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { infiniteLoop, simpleFunc } from "../../assembly-src/timeout-scenarios.meta";

// Part of the non-isolated batch scenario (as-pool-meta-no-isolate project):
// all *.meta-no-isolate files are sent to one PoolWorker in a single run message.
//
// The timeout here must abort the thread actually running this file's dispatch —
// not another dispatch in the batch — and the resumed run must finish this file
// AND the sibling passing files. The pre/post tests verify in-file resume
// integrity in the batch context.

test("batch pre-timeout passing test", () => {
  expect(simpleFunc()).toBe(42);
});

test("batch timeout [should fail]", TestOptions.timeout(100), () => {
  infiniteLoop();
});

test("batch post-timeout passing test", () => {
  expect(simpleFunc()).toBe(42);
});
