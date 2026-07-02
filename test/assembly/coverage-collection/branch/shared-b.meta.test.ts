import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { sharedBranch } from "../../../assembly-src/coverage-collection/branch/shared.meta";

// File B of the shared-source pair: exercises only the ELSE arm of sharedBranch.
// File A exercises the THEN arm. The accumulated branch coverage of
// branch-shared.meta.ts must sum both files' hits (see branches-shared.test.ts).
describe("shared branch fixture (file B — else arm)", () => {
  test("sharedBranch: else arm once", () => {
    expect(sharedBranch(-1)).toBe(-1);  // else
    // file B contributes else += 1
  });
});
