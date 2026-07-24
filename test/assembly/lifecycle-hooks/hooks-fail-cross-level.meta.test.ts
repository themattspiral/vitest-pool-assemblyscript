import { test, describe, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";

// Cross-LEVEL chain-failure stop (vitest parity): a hook failure aborts the
// whole chain across suite boundaries, not just within the failing hook's own
// suite. Within-a-single-suite stops are pinned by hooks-fail-before/after;
// this pins the cross-level direction. Console tags make it observable.

describe("outer suite with a failing beforeEach", () => {
  beforeEach(() => {
    console.log("cl:outer-before-ran");
    expect(1 + 1).toBe(3); // fails from the OUTER level
  });

  afterEach(() => {
    console.log("cl:outer-after-ran");
  });

  describe("inner suite", () => {
    beforeEach(() => {
      console.log("cl:inner-before-should-not-run");
    });

    afterEach(() => {
      console.log("cl:inner-after-ran");
    });

    test("outer beforeEach failure skips the inner beforeEach and the body [should fail]", () => {
      console.log("cl:body-should-not-run");
    });
  });
});

describe("outer suite whose afterEach should be stopped", () => {
  afterEach(() => {
    console.log("cl:outer-after-should-not-run");
  });

  describe("inner suite with a failing afterEach", () => {
    afterEach(() => {
      console.log("cl:inner-after-ran-2");
      expect(4).toBe(5); // fails from the INNER level (runs first, innermost)
    });

    test("inner afterEach failure stops the outer afterEach [should fail]", () => {
      console.log("cl:body-ran-2");
      expect(1).toBe(1); // body passes; the afterEach flips it to failed
    });
  });
});
