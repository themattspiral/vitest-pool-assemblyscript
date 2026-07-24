import { test, describe, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";
import { infiniteLoop } from "../../assembly-src/timeout-scenarios.meta";

// Each hook runs in its own timeout window (vitest semantics): the per-hook
// `timeout` arg sets the window, and a hung hook trips the HOOK timeout with
// vitest's distinct hook-timeout message (phase-annotated, since timeout
// errors carry no source-mapped frame). The timeout abort + thread-resume
// machinery treats a hung hook exactly like a hung test body.
//
// The small per-hook args also pin that the arg actually shortens the window —
// under the default hookTimeout these tests would take seconds to fail.

describe("hung beforeEach", () => {
  beforeEach(() => {
    infiniteLoop();
  }, 150);

  test("beforeEach hang trips the hook timeout [should fail]", () => {
    // never runs
  });
});

describe("hung afterEach", () => {
  afterEach(() => {
    infiniteLoop();
  }, 150);

  test("afterEach hang trips the hook timeout after the body passed [should fail]", () => {
    expect(1).toBe(1);
  });
});
