import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { double, triple, square, cube, halve } from "../../assembly-src/coverage-collection/partial-five-of-nine.meta";

// Exercises 5 of 9 functions (~55.56%) — contiguous uncovered block at the end
// Untested: remainder, sumOfSquares, difference, average

describe("partial coverage: 5 of 9", () => {
  test("double", () => {
    expect(double(4)).toBe(8);
  });

  test("triple", () => {
    expect(triple(3)).toBe(9);
  });

  test("square", () => {
    expect(square(5)).toBe(25);
  });

  test("cube", () => {
    expect(cube(3)).toBe(27);
  });

  test("halve", () => {
    expect(halve(10)).toBe(5);
  });
});
