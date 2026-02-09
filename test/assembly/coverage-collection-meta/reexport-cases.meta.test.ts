import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { originalFunc, barrelOwn } from "../../assembly-src/coverage-collection-meta/reexport-barrel.meta";

describe("re-export coverage", () => {
  test("call re-exported function via barrel", () => {
    expect(originalFunc(10)).toBe(11);
  });

  test("call barrel's own function", () => {
    expect(barrelOwn(5)).toBe(15);
  });

  // notReexported is intentionally NOT imported here —
  // it's only in the original file, never called from any test
});
