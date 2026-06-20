import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  absVal, clampLow, classify, clampRange, pickFirst, orDefault, sign,
  gateThenOnly, guardElseOnly,
} from "../../assembly-src/coverage-collection-meta/branch-if-ternary.meta";

// Exercises the if/ternary branch fixtures with KNOWN inputs so each arm's hit
// count is hand-derivable. The assertions on the resulting branch hit counts live
// in test/meta-verify/coverage-collection/branches-if-ternary.test.ts.
describe("if / ternary branch fixtures", () => {
  // Plain if/else: then twice, else once.
  test("absVal: if/else both arms", () => {
    expect(absVal(-3)).toBe(3);  // then
    expect(absVal(5)).toBe(5);   // else
    expect(absVal(-1)).toBe(1);  // then
    // if arms [then, else] = [2, 1]
  });

  // if without else: then once, implicit else once.
  test("clampLow: if without else, both arms", () => {
    expect(clampLow(-3)).toBe(0);  // then
    expect(clampLow(5)).toBe(5);   // implicit else
    // if arms [then, implicit-else] = [1, 1]
  });

  // else-if chain: outer then once (n=-5); inner then once (n=0); inner else once (n=9).
  test("classify: if / else-if / else chain", () => {
    expect(classify(-5)).toBe(-1);  // outer then
    expect(classify(0)).toBe(0);    // outer else → inner then
    expect(classify(9)).toBe(1);    // outer else → inner else
    // outer if [then, else] = [1, 2] ; inner if [then, else] = [1, 1]
  });

  // nested if: outer then twice (50, 200), outer implicit else once (-5);
  // inner reached twice, inner then once (200), inner implicit else once (50).
  test("clampRange: nested if, derived implicit elses", () => {
    expect(clampRange(50)).toBe(50);    // outer then → inner implicit else
    expect(clampRange(200)).toBe(100);  // outer then → inner then
    expect(clampRange(-5)).toBe(0);     // outer implicit else
    // outer if [then, implicit-else] = [2, 1] ; inner if [then, implicit-else] = [1, 1]
  });

  // ternary, both arms.
  test("pickFirst: ternary both arms", () => {
    expect(pickFirst(true)).toBe(1);   // then
    expect(pickFirst(false)).toBe(2);  // else
    // cond-expr arms [then, else] = [1, 1]
  });

  // ternary, else arm only (then never taken).
  test("orDefault: ternary else-only", () => {
    expect(orDefault(0, 9)).toBe(9);  // else
    expect(orDefault(0, 7)).toBe(7);  // else
    // cond-expr arms [then, else] = [0, 2]
  });

  // nested ternary: outer then once (5); outer else twice (−3, 0);
  // inner then once (−3); inner else once (0).
  test("sign: nested ternary", () => {
    expect(sign(5)).toBe(1);    // outer then
    expect(sign(-3)).toBe(-1);  // outer else → inner then
    expect(sign(0)).toBe(0);    // outer else → inner else
    // outer cond-expr [then, else] = [1, 2] ; inner cond-expr [then, else] = [1, 1]
  });

  // if/else, then arm only: else untested (reads 0).
  test("gateThenOnly: untested explicit else", () => {
    expect(gateThenOnly(5)).toBe(1);  // then
    expect(gateThenOnly(3)).toBe(1);  // then
    // if arms [then, else] = [2, 0]
  });

  // if without else, implicit-else path only: then untested (reads 0).
  test("guardElseOnly: untested then, derived implicit else", () => {
    expect(guardElseOnly(5)).toBe(5);  // implicit else
    expect(guardElseOnly(3)).toBe(3);  // implicit else
    // if arms [then, implicit-else] = [0, 2]
  });
});
