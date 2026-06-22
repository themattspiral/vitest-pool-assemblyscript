import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  multiLine, packed,
} from "../../../assembly-src/coverage-collection/statement/layout.meta";

// unusedPath is intentionally NEVER called — its body lines stay uncovered, exercising
// the uncovered-line set. Assertions in
// meta-verify/coverage-collection/statement/layout.test.ts.
describe("statement layout / line-coverage fixtures", () => {
  test("multiLine(3,4): multi-line statement", () => {
    expect(multiLine(3, 4)).toBe(7);
  });

  test("packed(5): multiple statements + multi-declarator on one line", () => {
    expect(packed(5)).toBe(14); // x=5, y=6, a=1, b=2
  });
});
