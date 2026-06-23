import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  calledOnce, calledTwice, calledThrice, calledFiveTimes, countdown, identity,
} from "../../../assembly-src/coverage-collection/function/counting.meta";

describe("function hit-count spectrum", () => {
  test("each function's hit count equals its number of calls", () => {
    expect(calledOnce()).toBe(1);

    calledTwice();
    expect(calledTwice()).toBe(2);

    calledThrice();
    calledThrice();
    expect(calledThrice()).toBe(3);

    calledFiveTimes();
    calledFiveTimes();
    calledFiveTimes();
    calledFiveTimes();
    expect(calledFiveTimes()).toBe(5);
    // neverCalled is intentionally never invoked
  });

  test("recursion yields one entry per call", () => {
    expect(countdown(4)).toBe(0);
  });

  test("monomorphized generic specializations", () => {
    expect(identity<i32>(1)).toBe(1);
    expect(identity<f64>(2.5)).toBeCloseTo(2.5);
  });
});
