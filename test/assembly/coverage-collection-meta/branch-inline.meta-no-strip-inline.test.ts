import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { useInlineGate } from "../../assembly-src/coverage-collection-meta/branch-inline.meta";

// Exercises the inlined branch via its caller. This file's distinct
// `.meta-no-strip-inline.test.ts` suffix routes it to the as-pool-meta-no-strip-inline
// project (stripInline:false), so inlineGate's if-branch is inlined into
// useInlineGate but attributed to its own source file (branch-inline-helper.meta.ts).
// Assertions live in test/meta-verify/coverage-collection/branches-inline.test.ts.
describe("inlined branch fixture (stripInline:false)", () => {
  test("useInlineGate: exercises the inlined if-branch on both arms", () => {
    expect(useInlineGate(5)).toBe(1);     // inlined then (n > 0)
    expect(useInlineGate(-1)).toBe(-1);   // inlined else
    // inlineGate's if arms [then, else] = [1, 1], attributed to the helper file
  });
});
