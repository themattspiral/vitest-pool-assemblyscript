import { test, describe, expect, beforeEach } from "vitest-pool-assemblyscript/assembly";
import { infiniteLoop, simpleFunc } from "../../assembly-src/timeout-scenarios.meta";

// Config-default timeout resolution: NOTHING in this file sets a timeout — no
// TestOptions.timeout, no per-hook timeout arg. The as-pool-meta-default-timeouts
// project config supplies small `testTimeout` and `hookTimeout` values, so a
// hang here trips the CONFIG defaults. Where the hang lives selects which
// resolution path is proven: a test-body hang must report the config
// testTimeout, and a hook hang must report the config hookTimeout — values
// distinct from each other and from every explicit timeout used elsewhere, so
// the reported ms differentiates default resolution from any explicit path.

test("passing test under default windows", () => {
  expect(simpleFunc()).toBe(42);
});

test("test-body hang trips the config-default testTimeout [should fail]", () => {
  infiniteLoop();
});

describe("hung beforeEach under config-default hookTimeout", () => {
  beforeEach(() => {
    infiniteLoop();
  });

  test("beforeEach hang trips the config-default hookTimeout [should fail]", () => {
    // never runs
  });
});
