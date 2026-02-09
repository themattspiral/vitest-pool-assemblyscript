import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { addOne, subtractOne, doubleValue, isNonNegative, sumThree } from "../../assembly-src/coverage-collection-meta/partial-all-covered.meta";

// Exercises all 5 functions — 100% coverage

describe("full coverage: 5 of 5", () => {
  test("addOne", () => {
    expect(addOne(0)).toBe(1);
  });

  test("subtractOne", () => {
    expect(subtractOne(10)).toBe(9);
  });

  test("doubleValue", () => {
    expect(doubleValue(7)).toBe(14);
  });

  test("isNonNegative", () => {
    expect(isNonNegative(0)).toBe(true);
    expect(isNonNegative(-1)).toBe(false);
  });

  test("sumThree", () => {
    expect(sumThree(1, 2, 3)).toBe(6);
  });
});
