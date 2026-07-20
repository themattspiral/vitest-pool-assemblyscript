import { test, describe, expect, beforeEach } from "vitest-pool-assemblyscript/assembly";

// beforeEach execution-order fixture: hooks share the test's WASM instance, so
// module-level state written by the beforeEach chain is asserted from inside
// each test. Pins vitest chain semantics: outermost-suite-first across nesting,
// registration order within a suite, and suite-scoped position independence
// (the second file-level hook is registered at the bottom of this file, after
// every test). afterEach effects die with the instance, so afterEach behavior
// is pinned by the meta suite instead.

let order: string[] = [];

beforeEach(() => {
  order.push("file-1");
});

test("top-level test sees both file-level hooks, in registration order", () => {
  // file-2 is registered at the bottom of this file, yet still applies
  expect(order.join("|")).toBe("file-1|file-2");
});

describe("outer suite", () => {
  beforeEach(() => {
    order.push("outer-1");
  });

  test("outer test runs file-level hooks before suite hooks", () => {
    expect(order.join("|")).toBe("file-1|file-2|outer-1");
  });

  test("sibling test gets a fresh instance: chain state is re-created, not accumulated", () => {
    expect(order.join("|")).toBe("file-1|file-2|outer-1");
  });

  describe("inner suite", () => {
    beforeEach(() => {
      order.push("inner-1");
    });

    beforeEach(() => {
      order.push("inner-2");
    });

    test("nested test sees file, outer, then inner hooks in registration order", () => {
      expect(order.join("|")).toBe("file-1|file-2|outer-1|inner-1|inner-2");
      expect(order.length).toBe(5);
    });
  });

  test("suite hook registered after a nested describe still only applies at its own level", () => {
    expect(order.join("|")).toBe("file-1|file-2|outer-1");
  });
});

// suite-scoped position independence: registered after every test in the file,
// but still runs (second, per file-level registration order) for all of them
beforeEach(() => {
  order.push("file-2");
});
