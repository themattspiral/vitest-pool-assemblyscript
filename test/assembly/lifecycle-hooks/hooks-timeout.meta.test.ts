import { test, describe, expect, beforeEach, afterEach, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { infiniteLoop } from "../../assembly-src/timeout-scenarios.meta";

// Core-phase behavior: hooks run inside the test's timeout window, so a hung
// hook trips the plain TEST timeout (vitest's distinct hookTimeout message is
// a scoped follow-on phase). The timeout abort + thread-resume machinery
// treats a hung hook exactly like a hung test body.

describe("hung beforeEach", () => {
  beforeEach(() => {
    infiniteLoop();
  });

  test("beforeEach hang trips the test timeout [should fail]", TestOptions.timeout(150), () => {
    // never runs
  });
});

describe("hung afterEach", () => {
  afterEach(() => {
    infiniteLoop();
  });

  test("afterEach hang trips the test timeout after the body passed [should fail]", TestOptions.timeout(150), () => {
    expect(1).toBe(1);
  });
});
