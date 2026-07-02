import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { pick } from "../../../assembly-src/coverage-collection/statement/shared.meta";

// Covers ONLY the then-arm; shared-b covers the else-arm. The combined (accumulated
// across both binaries) coverage is asserted in .../statement/shared.test.ts.
describe("shared statement source (file A)", () => {
  test("pick(true): then-arm", () => {
    expect(pick(true)).toBe(1);
  });
});
