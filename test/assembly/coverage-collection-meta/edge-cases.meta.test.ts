import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { calculate as calculateA, onlyInA } from "../../assembly-src/coverage-collection-meta/edge/name-collision-a.meta";
import { calculate as calculateB, onlyInB } from "../../assembly-src/coverage-collection-meta/edge/name-collision-b.meta";
import { add as edgeAdd, edgeOnly } from "../../assembly-src/coverage-collection-meta/edge/math-helpers.meta";

describe("same-named functions in different files", () => {
  test("calculate from file A adds", () => {
    expect(calculateA(3, 4)).toBe(7);
  });

  test("calculate from file B multiplies", () => {
    expect(calculateB(3, 4)).toBe(12);
  });

  test("unique functions track independently", () => {
    expect(onlyInA()).toBe(100);
    expect(onlyInB()).toBe(200);
  });
});

describe("same-named file in different directory", () => {
  test("add from edge dir has different implementation", () => {
    expect(edgeAdd(3, 4)).toBe(8);
  });

  test("edge-only function", () => {
    expect(edgeOnly()).toBe(42);
  });
});
