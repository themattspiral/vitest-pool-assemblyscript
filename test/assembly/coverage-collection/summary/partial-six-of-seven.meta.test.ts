import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { factorial, fibonacci, power, sumRange, gcd, lcm } from "../../../assembly-src/coverage-collection/summary/partial-six-of-seven.meta";

// Exercises 6 of 7 functions (~85.71%) — triangleNumber is untested

describe("partial coverage: 6 of 7", () => {
  test("factorial", () => {
    expect(factorial(5)).toBe(120);
    expect(factorial(0)).toBe(1);
  });

  test("fibonacci", () => {
    expect(fibonacci(10)).toBe(55);
    expect(fibonacci(0)).toBe(0);
  });

  test("power", () => {
    expect(power(2, 8)).toBe(256);
    expect(power(3, 3)).toBe(27);
  });

  test("sumRange", () => {
    expect(sumRange(1, 10)).toBe(55);
  });

  test("gcd", () => {
    expect(gcd(12, 8)).toBe(4);
    expect(gcd(17, 5)).toBe(1);
  });

  test("lcm", () => {
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(3, 7)).toBe(21);
  });
});
