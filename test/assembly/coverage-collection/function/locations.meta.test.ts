import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { atLineThree, Located } from "../../../assembly-src/coverage-collection/function/function-locations.meta";
import { firstLine, middleFunction, lastLine } from "../../../assembly-src/coverage-collection/function/file-boundary.meta";

describe("function location accuracy", () => {
  test("call atLineThree", () => {
    expect(atLineThree(7)).toBe(7);
  });

  test("call Located methods", () => {
    const loc = new Located();
    expect(loc.method()).toBe(1);
    expect(loc.prop).toBe(2);
    expect(Located.staticMethod()).toBe(3);
  });
});

describe("file boundary functions", () => {
  test("function at first line of file", () => {
    expect(firstLine(10)).toBe(11);
  });

  test("function in the middle", () => {
    expect(middleFunction(10)).toBe(12);
  });

  test("function at last line of file (no trailing newline)", () => {
    expect(lastLine(10)).toBe(13);
  });
});
