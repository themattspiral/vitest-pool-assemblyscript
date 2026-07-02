import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { filledArray, sumArray, matrix } from "../../../assembly-src/coverage-collection/pass-100/memory";

describe("array / memory operations", () => {
  test("fill, sum, nested 2-D allocation", () => {
    const arr = filledArray(4);
    expect(arr[3]).toBe(6);          // 3*2
    expect(sumArray(arr)).toBe(12);  // 0+2+4+6
    const m = matrix(2, 3);
    expect(m[1][2]).toBe(5);         // 1*3+2
  });
});
