import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { toUpperBound, sign, isPositive } from "../../assembly-src/coverage-collection-meta/partial-three-of-seven.meta";

// Exercises 3 of 7 functions (~42.86%) with non-contiguous gaps
// Untested: toLowerBound, absoluteValue, isEven, isZero (interleaved with tested functions)

describe("partial coverage: 3 of 7 (non-contiguous)", () => {
  test("toUpperBound", () => {
    expect(toUpperBound(15, 10)).toBe(10);
    expect(toUpperBound(5, 10)).toBe(5);
  });

  test("sign", () => {
    expect(sign(5)).toBe(1);
    expect(sign(-3)).toBe(-1);
    expect(sign(0)).toBe(0);
  });

  test("isPositive", () => {
    expect(isPositive(1)).toBe(true);
    expect(isPositive(-1)).toBe(false);
  });
});
