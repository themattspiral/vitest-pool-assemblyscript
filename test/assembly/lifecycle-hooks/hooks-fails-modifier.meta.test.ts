import { test, describe, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";

// `fails` inversion applies to hook failures exactly like test-fn failures
// (vitest inverts the final result state after all phases have run).

describe("fails modifier with failing beforeEach", () => {
  beforeEach(() => {
    expect(1).toBe(2);
  });

  test.fails("beforeEach failure satisfies `fails` — inverted to pass", () => {
    // never runs (beforeEach fails first)
  });
});

describe("fails modifier with failing afterEach", () => {
  afterEach(() => {
    expect(3).toBe(4);
  });

  test.fails("afterEach failure satisfies `fails` — inverted to pass", () => {
    expect(1).toBe(1);
  });
});

describe("fails modifier with all hooks passing", () => {
  beforeEach(() => {
    console.log("fm:before-ran");
  });

  afterEach(() => {
    console.log("fm:after-ran");
  });

  test.fails("no failure anywhere fails the `fails` expectation [should fail]", () => {
    expect(1).toBe(1);
  });
});
