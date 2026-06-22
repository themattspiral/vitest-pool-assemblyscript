import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  category, dayType, classifySign, firstOnly, emptyTrailing,
  cumulative, signBucket, colorName, grid, midDefault,
} from "../../assembly-src/coverage-collection/branch-switch.meta";

// Exercises the switch-branch fixtures with KNOWN inputs so each arm's "entered"
// hit count is hand-derivable. The assertions on the resulting branch hit counts
// live in test/meta-verify/coverage-collection/branches-switch.test.ts.
describe("switch branch fixtures", () => {
  // Clean switch: case 1 + default exercised; case 2 never.
  test("category: clean switch", () => {
    expect(category(1)).toBe(10);    // case 1
    expect(category(99)).toBe(-1);   // default
    // arms [case1, case2, default] = [1, 0, 1]
  });

  // Empty fall-through: empty case 0 ENTERED (covered), empty case 1 NEVER entered.
  test("dayType: empty fall-through", () => {
    expect(dayType(0)).toBe(1);   // case 0 (empty) → falls into case 6 body
    expect(dayType(2)).toBe(2);   // case 2 (body); case 1 (empty) NOT entered
    expect(dayType(9)).toBe(0);   // default
    // arms [case0, case6, case1, case2, default] = [1, 1, 0, 1, 1]
  });

  // No default: implicit default arm reached by n=5; case 1 never.
  test("classifySign: switch without default", () => {
    expect(classifySign(0)).toBe(10);  // case 0
    expect(classifySign(5)).toBe(0);   // no match → implicit default
    // arms [case0, case1, implicit-default] = [1, 0, 1]
  });

  // Break-only case 0 matched; case 1 never; default reached.
  test("firstOnly: break-only case", () => {
    expect(firstOnly(0)).toBe(-1);  // case 0 (break-only, runs no body)
    expect(firstOnly(5)).toBe(99);  // default
    // arms [case0, case1, default] = [1, 0, 1]
  });

  // Trailing empty case 2 falls into default; default also reached directly.
  test("emptyTrailing: trailing empty into default", () => {
    expect(emptyTrailing(1)).toBe(10);  // case 1
    expect(emptyTrailing(2)).toBe(99);  // case 2 (empty) → falls into default body
    expect(emptyTrailing(5)).toBe(99);  // no match → default directly
    // arms [case1, case2, default] = [1, 1, 2]  (default entered by n=2 fallthrough + n=5)
  });

  // Body fall-through accumulates entered counts down the chain.
  test("cumulative: body-bearing fall-through", () => {
    expect(cumulative(1)).toBe(7);  // case1 + case2 + default bodies (1+2+4)
    expect(cumulative(2)).toBe(6);  // case2 + default bodies (2+4)
    expect(cumulative(5)).toBe(4);  // default body (4)
    // arms [case1, case2, default] = [1, 2, 3]
  });

  // Negative / large / sparse literals.
  test("signBucket: negative, large, sparse literals", () => {
    expect(signBucket(-5)).toBe(1);    // case -5
    expect(signBucket(1000)).toBe(2);  // case 1000
    expect(signBucket(0)).toBe(0);     // default; case 7 never
    // arms [case-5, case1000, case7, default] = [1, 1, 0, 1]
  });

  // Enum-valued labels: Red (0) and Blue (2) matched; Green never; default never.
  test("colorName: enum case labels", () => {
    expect(colorName(0)).toBe(1);  // Color.Red
    expect(colorName(2)).toBe(3);  // Color.Blue
    // arms [Red, Green, Blue, default] = [1, 0, 1, 0]
  });

  // Nested switch: outer case 0 reached twice (inner case 0 + inner default),
  // outer default once; inner reached only when outer takes case 0.
  test("grid: nested switch", () => {
    expect(grid(0, 0)).toBe(1);  // outer case0 → inner case0
    expect(grid(0, 5)).toBe(2);  // outer case0 → inner default
    expect(grid(9, 0)).toBe(3);  // outer default (inner not reached)
    // outer [case0, default] = [2, 1] ; inner [case0, default] = [1, 1]
  });

  // Default in the middle: arms reported in source order (case1, default, case2).
  test("midDefault: default in the middle", () => {
    expect(midDefault(1)).toBe(1);  // case 1
    expect(midDefault(5)).toBe(0);  // default; case 2 never
    // arms [case1, default, case2] = [1, 1, 0]
  });
});
