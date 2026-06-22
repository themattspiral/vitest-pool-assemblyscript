import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { useComputeStat } from "../../../assembly-src/coverage-collection/statement/inline.meta";

// The .meta-no-strip-inline.test.ts suffix routes this to the as-pool-meta-no-strip-inline
// project (stripInline:false), so computeStat's statements are inlined into
// useComputeStat but attributed to their own source. Assertions in
// .../statement/inline.test.ts.
describe("inlined statement fixture (stripInline:false)", () => {
  test("useComputeStat: runs the inlined statements", () => {
    expect(useComputeStat(5)).toBe(11);  // (5 * 2) + 1
    expect(useComputeStat(10)).toBe(21); // (10 * 2) + 1
    // computeStat inlined twice; its statements attributed to the helper source
  });
});
