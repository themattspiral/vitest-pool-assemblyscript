import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  useDefaultCtorIf, useExplicitCtorIf, pickDefaultCtor,
} from "../../../assembly-src/coverage-collection/branch/filing.meta";

// Exercises the branch-filing fixtures with KNOWN inputs. Each branch is taken on
// both arms, so a correctly-filed decision reads [1,1]; the filing bug read [0,0]
// (the decision mis-filed under the foreign class file). Assertions live in
// test/meta-verify/coverage-collection/branches-filing.test.ts.
describe("branch filing fixtures", () => {
  test("useDefaultCtorIf: foreign-inlined-default then-arm (the filing bug repro)", () => {
    expect(useDefaultCtorIf(0)).toBe(0);  // then: new Box().value
    expect(useDefaultCtorIf(5)).toBe(6);  // else: a + 1
    // if arms [then, else] = [1, 1]
  });

  test("useExplicitCtorIf: explicit ctor arg (home-located control)", () => {
    expect(useExplicitCtorIf(0)).toBe(5);  // then: new Box(5).value
    expect(useExplicitCtorIf(5)).toBe(6);  // else: a + 1
    // if arms [then, else] = [1, 1]
  });

  test("pickDefaultCtor: foreign-inlined-default ternary then-arm", () => {
    expect(pickDefaultCtor(0)).toBe(0);  // then: new Box().value
    expect(pickDefaultCtor(5)).toBe(6);  // else: a + 1
    // cond-expr arms [then, else] = [1, 1]
  });
});
