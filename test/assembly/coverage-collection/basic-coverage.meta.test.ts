import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { add, subtract, multiply } from "../../assembly-src/coverage-collection/math-helpers.meta";
import { MixedCounter } from "../../assembly-src/coverage-collection/class-with-mixed-usage.meta";
import { calledOnce, calledThrice, calledFiveTimes } from "../../assembly-src/coverage-collection/call-counting.meta";

describe("partial function coverage", () => {
  test("add called 3 times", () => {
    expect(add(1, 2)).toBe(3);
    expect(add(10, 20)).toBe(30);
    expect(add(-1, 1)).toBe(0);
  });

  test("multiply called 2 times", () => {
    expect(multiply(3, 4)).toBe(12);
    expect(multiply(2, 5)).toBe(10);
  });

  test("subtract called once", () => {
    expect(subtract(10, 3)).toBe(7);
  });
});

describe("class partial coverage", () => {
  test("uses constructor, increment, and value getter", () => {
    const counter = new MixedCounter(0);
    counter.increment();
    counter.increment();
    counter.increment();
    expect(counter.value).toBe(3);
  });
});

describe("precise call counting", () => {
  test("calledOnce - 1 invocation", () => {
    expect(calledOnce()).toBe(1);
  });

  test("calledThrice - 3 invocations", () => {
    calledThrice();
    calledThrice();
    expect(calledThrice()).toBe(3);
  });

  test("calledFiveTimes - 5 invocations", () => {
    calledFiveTimes();
    calledFiveTimes();
    calledFiveTimes();
    calledFiveTimes();
    expect(calledFiveTimes()).toBe(5);
  });
});
