import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { inlinedAdd, normalAdd, callsInlined } from "../../../assembly-src/coverage-collection/function/inline-functions.meta";
import { identity, isNull, nonGeneric } from "../../../assembly-src/coverage-collection/function/generic-functions.meta";
import { emptyVoid, returnsZero, nonEmpty } from "../../../assembly-src/coverage-collection/function/empty-functions.meta";
import { calledBeforeTrap, willTrap } from "../../../assembly-src/coverage-collection/function/trap-coverage.meta";

describe("inline function coverage", () => {
  test("direct call to inlined function", () => {
    expect(inlinedAdd(1, 2)).toBe(3);
  });

  test("call through wrapper (inlined internally)", () => {
    expect(callsInlined(3, 4)).toBe(7);
  });

  test("normal function for comparison", () => {
    expect(normalAdd(5, 6)).toBe(11);
  });
});

describe("generic function coverage", () => {
  test("identity with i32", () => {
    expect(identity<i32>(42)).toBe(42);
  });

  test("identity with f64", () => {
    expect(identity<f64>(3.14)).toBeCloseTo(3.14);
  });

  test("identity with string", () => {
    expect(identity<string>("hello")).toBe("hello");
  });

  test("isNull with non-null", () => {
    expect(isNull<string>("hello")).toBe(false);
  });

  test("isNull with null", () => {
    expect(isNull<string>(null)).toBe(true);
  });

  test("nonGeneric for comparison", () => {
    expect(nonGeneric(7)).toBe(7);
  });
});

describe("empty and minimal functions", () => {
  test("empty void function", () => {
    emptyVoid();
    // no assertion needed — just verifying it runs and is tracked
    expect(true).toBeTruthy();
  });

  test("returns zero", () => {
    expect(returnsZero()).toBe(0);
  });

  test("non-empty for comparison", () => {
    expect(nonEmpty(5)).toBe(10);
  });
});

describe("trap coverage (entry counting)", () => {
  test("function called before trap has coverage", () => {
    expect(calledBeforeTrap()).toBe(42);
  });

  test("function that traps still has coverage", () => {
    expect(() => {
      willTrap();
    }).toThrowError();
  });
});
