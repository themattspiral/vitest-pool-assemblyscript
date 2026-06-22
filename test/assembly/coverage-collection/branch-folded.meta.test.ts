import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  foldedIfTrue, foldedIfFalse, foldedNested, foldedNamedConst, foldedCompare,
  foldedFusedAndConst, foldedTernaryConst, foldedTernaryLive,
  foldedAndEval, foldedAndShort, foldedOrShort, foldedOrEval,
} from "../../assembly-src/coverage-collection/branch-folded.meta";

// Exercises each folded-branch fixture ONCE. The compiler removes the branch, so
// coverage must still report the live arm covered and the eliminated arm 0. The
// assertions live in test/meta-verify/coverage-collection/branches-folded.test.ts.
describe("folded branch fixtures", () => {
  test("if(true) / if(false)", () => {
    expect(foldedIfTrue(0)).toBe(1);   // then live, else eliminated -> [1,0]
    expect(foldedIfFalse(0)).toBe(2);  // then eliminated, else live -> [0,1]
  });

  test("nested if(true){ if(true) }", () => {
    expect(foldedNested(0)).toBe(1);   // outer [1,0], inner [1,0]
  });

  test("non-literal folds: named const, constant comparison, fused const", () => {
    expect(foldedNamedConst(0)).toBe(1);    // if(FLAG)      -> [1,0]
    expect(foldedCompare(0)).toBe(1);       // if(1 < 2)     -> [1,0]
    expect(foldedFusedAndConst(0)).toBe(1); // if(true&&true)-> if [1,0]
  });

  test("folded ternaries: const/const (accepted) vs live arm", () => {
    expect(foldedTernaryConst(0)).toBe(10);  // true ? 10 : 20  -> accepted [0,0]
    expect(foldedTernaryLive(5)).toBe(6);    // true ? x+1 : x+2 -> [1,0]
  });

  test("folded logicals: && / || x left-true / left-false", () => {
    expect(foldedAndEval(5)).toBe(true);    // true && x>0  -> right evaluated [1,1]
    expect(foldedAndShort(5)).toBe(false);  // false && x>0 -> right short    [1,0]
    expect(foldedOrShort(5)).toBe(true);    // true || x>0  -> right short    [1,0]
    expect(foldedOrEval(5)).toBe(true);     // false || x>0 -> right evaluated[1,1]
  });
});
