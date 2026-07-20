import { test, describe, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";

// Full execution-order pinning via console tags, including the afterEach
// reversal (vitest 'stack' default). Expected bracket around the test body:
//   f-be1, f-be2, s-be1, s-be2, body, s-ae2, s-ae1, f-ae2, f-ae1
// (beforeEach: outermost-first + registration order; afterEach:
// innermost-first + reverse registration order.)
// Also pins: a skipped sibling produces NO hook output at all.

beforeEach(() => { console.log("order:f-be1"); });
beforeEach(() => { console.log("order:f-be2"); });
afterEach(() => { console.log("order:f-ae1"); });
afterEach(() => { console.log("order:f-ae2"); });

describe("ordered suite", () => {
  beforeEach(() => { console.log("order:s-be1"); });
  beforeEach(() => { console.log("order:s-be2"); });
  afterEach(() => { console.log("order:s-ae1"); });
  afterEach(() => { console.log("order:s-ae2"); });

  test("hook order bracket", () => {
    console.log("order:body");
    expect(1).toBe(1);
  });

  test.skip("skipped test runs no hooks", () => {
    console.log("order:skipped-body-should-not-run");
  });
});
