import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { helper, readComputed, COMPUTED, DOUBLE_COMPUTED } from "../../../assembly-src/coverage-collection/function/top-level-code.meta";
import { MathUtils } from "../../../assembly-src/coverage-collection/function/namespace-functions.meta";
import { topLevel } from "../../../assembly-src/coverage-collection/function/namespace-functions.meta";
import { Animals, Robots } from "../../../assembly-src/coverage-collection/function/namespace-classes.meta";

describe("top-level executable code coverage", () => {
  test("helper function called directly", () => {
    expect(helper(5)).toBe(10);
  });

  test("COMPUTED was initialized via top-level helper call", () => {
    expect(COMPUTED).toBe(42);
  });

  test("DOUBLE_COMPUTED was initialized via chained top-level call", () => {
    expect(DOUBLE_COMPUTED).toBe(84);
  });

  test("readComputed reads both computed values", () => {
    expect(readComputed()).toBe(126);
  });
});

describe("namespace function coverage", () => {
  test("call namespace function square", () => {
    expect(MathUtils.square(5)).toEqual(25);
  });

  test("call namespace function cube", () => {
    expect(MathUtils.cube(3)).toEqual(27);
  });

  // MathUtils.unused is intentionally not called

  test("top-level function for comparison", () => {
    expect(topLevel(9)).toBe(10);
  });
});

describe("namespace class coverage", () => {
  test("construct and use Animals.Dog", () => {
    const expected = new Animals.Dog("Rex");
    const actual = new Animals.Dog("Rex");
    expect(actual).toEqual(expected);
    expect(actual.speak()).toEqual("woof");
  });

  test("construct and use Robots.Dog", () => {
    const expected = new Robots.Dog("K9");
    const actual = new Robots.Dog("K9");
    expect(actual).toEqual(expected);
    expect(actual.speak()).toEqual("beep");

  });
});
