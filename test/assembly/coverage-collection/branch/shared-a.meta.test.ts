import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { sharedBranch } from "../../../assembly-src/coverage-collection/branch/shared.meta";

// File A of the shared-source pair: exercises only the THEN arm of sharedBranch.
// File B exercises the ELSE arm. The accumulated branch coverage of
// branch/shared.meta.ts must sum both files' hits
describe("shared branch fixture (file A — then arm)", () => {
  test("sharedBranch: then arm twice", () => {
    expect(sharedBranch(5)).toBe(1);  // then
    expect(sharedBranch(3)).toBe(1);  // then
    // file A contributes then += 2
  });
});
