import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  square, withNested, useArrow, useMultiDeclarator,
  applyTwice, useNamedCallback, useAnonCallback, factorial, identity,
} from "../../../assembly-src/coverage-collection/pass-100/functions";

describe("function shapes", () => {
  test("plain, nested, arrow, multi-declarator", () => {
    expect(square(4)).toBe(16);
    expect(withNested(3)).toBe(8);          // (3+1)*2
    expect(useArrow(2)).toBe(6);            // 2*3
    expect(useMultiDeclarator(3)).toBe(7);  // addOne(doubleIt(3)) = (3*2)+1
  });

  test("callbacks: named, anonymous, direct higher-order", () => {
    expect(useNamedCallback(2)).toBe(16);   // square(square(2))
    expect(useAnonCallback(1)).toBe(21);    // ((1+10)+10)
    expect(applyTwice(3, square)).toBe(81); // square(square(3))
  });

  test("recursion takes both base-case arms", () => {
    expect(factorial(4)).toBe(24);          // n>1 several times, then n<=1
  });

  test("generic monomorphizations", () => {
    expect(identity<i32>(5)).toBe(5);
    expect(identity<f64>(2.5)).toBeCloseTo(2.5);
  });
});
