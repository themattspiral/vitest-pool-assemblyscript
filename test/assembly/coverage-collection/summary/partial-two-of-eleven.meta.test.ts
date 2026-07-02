import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { increment, decrement } from "../../../assembly-src/coverage-collection/summary/partial-two-of-eleven.meta";

// Exercises 2 of 11 functions (~18.18%) — most functions are untested

describe("partial coverage: 2 of 11", () => {
  test("increment", () => {
    expect(increment(0)).toBe(1);
    expect(increment(99)).toBe(100);
  });

  test("decrement", () => {
    expect(decrement(10)).toBe(9);
    expect(decrement(1)).toBe(0);
  });
});
