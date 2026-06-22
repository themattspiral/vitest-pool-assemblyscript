import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { pick } from "../../../assembly-src/coverage-collection/statement/shared.meta";

// Covers ONLY the else-arm; shared-a covers the then-arm. Combined coverage is
// asserted in .../statement/shared.test.ts.
describe("shared statement source (file B)", () => {
  test("pick(false): else-arm", () => {
    expect(pick(false)).toBe(2);
  });
});
