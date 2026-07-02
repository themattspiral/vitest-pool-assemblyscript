import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { calculate as calculateA, onlyInA } from "../../../assembly-src/coverage-collection/function/name-collision-a.meta";
import { calculate as calculateB, onlyInB } from "../../../assembly-src/coverage-collection/function/name-collision-b.meta";
import { add as mainAdd, mainOnly } from "../../../assembly-src/coverage-collection/function/math-helpers.meta";
import { add as edgeAdd, edgeOnly } from "../../../assembly-src/coverage-collection/function/edge/math-helpers.meta";

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
  test("add + unique fn from the main math-helpers", () => {
    expect(mainAdd(3, 4)).toBe(7);
    expect(mainOnly()).toBe(7);
  });

  test("add + unique fn from the edge math-helpers (different implementation)", () => {
    expect(edgeAdd(3, 4)).toBe(8);
    expect(edgeOnly()).toBe(42);
  });
});
