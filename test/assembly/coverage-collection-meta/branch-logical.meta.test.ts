import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  andCheck, orCheck, ifAnd, ifOr, andChain,
} from "../../assembly-src/coverage-collection-meta/branch-logical.meta";

// Exercises the logical-branch fixtures with KNOWN inputs so each operand arm's
// per-evaluation hit count is hand-derivable. The assertions on the resulting
// branch hit counts live in
// test/meta-verify/coverage-collection/branches-logical.test.ts.
describe("logical branch fixtures", () => {
  // Real `&&`: left always evaluated, right only when left is true.
  test("andCheck: && short-circuit", () => {
    expect(andCheck(1, 1)).toBe(true);    // left true → right evaluated
    expect(andCheck(-1, 1)).toBe(false);  // left false → right short-circuited
    // && arms: left = 2, right = 1
  });

  // Real `||`: left always evaluated, right only when left is false.
  test("orCheck: || short-circuit", () => {
    expect(orCheck(-1, 1)).toBe(true);    // left false → right evaluated
    expect(orCheck(1, 1)).toBe(true);     // left true → right short-circuited
    // || arms: left = 2, right = 1
  });

  // Fused `if (a && b)` no else: then once, implicit else twice (derived).
  test("ifAnd: fused && in if without else", () => {
    expect(ifAnd(1, 1)).toBe(1);    // cond true → then
    expect(ifAnd(1, -1)).toBe(0);   // left true, right false → cond false → implicit else
    expect(ifAnd(-1, 5)).toBe(0);   // left false → short → cond false → implicit else
    // && arms: left = 3, right = 2 ; if arms: then = 1, implicit else = 3 − 1 = 2
  });

  // Fused `if (a || b)` with explicit else: then twice, else once (both located).
  test("ifOr: fused || in if with else", () => {
    expect(ifOr(1, 1)).toBe(1);     // left true → short → cond true → then
    expect(ifOr(-1, 1)).toBe(1);    // left false, right true → cond true → then
    expect(ifOr(-1, -1)).toBe(0);   // left false, right false → cond false → else
    // || arms: left = 3, right = 2 ; if arms: then = 2, else = 1
  });

  // Chained && (nested): inner (a&&b) and outer ((a&&b)&&c).
  test("andChain: chained &&", () => {
    expect(andChain(1, 1, 1)).toBe(true);    // all true
    expect(andChain(1, -1, 1)).toBe(false);  // a true, b false → inner false → c skipped
    expect(andChain(-1, 1, 1)).toBe(false);  // a false → b skipped → inner false → c skipped
    // inner (a&&b): left = 3, right = 2 ; outer ((a&&b)&&c): left = 3, right = 1
  });
});
