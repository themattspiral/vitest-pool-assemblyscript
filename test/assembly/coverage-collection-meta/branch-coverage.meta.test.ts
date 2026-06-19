import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  dayType, category, clampLow, pickFirst,
  foldedIf, foldedTernary, foldedAndEval, foldedAndShort,
} from "../../assembly-src/coverage-collection-meta/branch-coverage.meta";

// Exercises the branch-coverage fixtures with KNOWN inputs so each construct's
// per-arm branch coverage is exactly hand-derivable. The assertions on the
// resulting branch hit counts live in test/meta-verify/coverage-collection/branches.test.ts.
describe("branch coverage fixtures", () => {
  // Empty fall-through switch. Inputs chosen so empty case 0 is ENTERED (covered)
  // while empty case 1 is NEVER entered — the empty case must read 0, not pick up
  // an adjacent hit.
  test("dayType: empty fall-through switch", () => {
    expect(dayType(0)).toBe(1);  // case 0 (empty) → falls through to case 6 body
    expect(dayType(2)).toBe(2);  // case 2 (body) directly; case 1 (empty) NOT entered
    expect(dayType(9)).toBe(0);  // default
  });

  // Clean switch: case 1 + default exercised; case 2 never.
  test("category: clean switch", () => {
    expect(category(1)).toBe(10);   // case 1
    expect(category(99)).toBe(-1);  // default
  });

  // if without else: then taken; the implicit else arm is never taken (reads 0).
  test("clampLow: if without else", () => {
    expect(clampLow(-3)).toBe(0);   // then (n < 0)
  });

  // ternary: then arm taken; else arm never (reads 0).
  test("pickFirst: ternary", () => {
    expect(pickFirst(true)).toBe(1);  // then arm
  });

  // Folded constant-condition branches. The compiler removes the branch; coverage
  // must still report the live arm covered and the eliminated arm 0 (v8 parity).
  test("folded constant-condition branches", () => {
    expect(foldedIf(0)).toBe(1);          // if(true) → then always taken
    expect(foldedTernary(0)).toBe(10);    // true ? 10 : 20 → then
    expect(foldedAndEval(5)).toBe(true);  // true && (5 > 0) → right evaluated
    expect(foldedAndShort(5)).toBe(false);// false && _ → right short-circuited
  });
});
