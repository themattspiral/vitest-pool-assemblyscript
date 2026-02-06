import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import * as fail from "../../assembly-src/failure-utils.meta";
import { throwsError } from "../../assembly-src/inline-utils.meta";

describe("function and callback combinations", () => {
  test("failNamedFunc [should fail]", () => {
    const val = fail.failNamedFunc();
    expect(val).toBe(3);
  });

  test("failArrowFunc [should fail]", () => {
    const val = fail.failArrowFunc();
    expect(val).toBe(3);
  });

  test("failNamedCallbackInNamed [should fail]", () => {
    const val = fail.failNamedCallbackInNamed();
    expect(val).toBe(3);
  });

  test("failArrowCallbackInNamed [should fail]", () => {
    const val = fail.failArrowCallbackInNamed();
    expect(val).toBe(3);
  });

  test("failAnonCallbackInNamed [should fail]", () => {
    const val = fail.failAnonCallbackInNamed();
    expect(val).toBe(3);
  });

  test("failAnonCallbackInNamedCallsNamed [should fail]", () => {
    const val = fail.failAnonCallbackInNamedCallsNamed();
    expect(val).toBe(3);
  });

  test("failAnonCallbackInNamedCallsArrow [should fail]", () => {
    const val = fail.failAnonCallbackInNamedCallsArrow();
    expect(val).toBe(3);
  });
});

describe("classes", () => {
  test("ClassWithFailingMethods.fail() [should fail]", () => {
    const c = new fail.ClassWithFailingMethods();
    const val = c.fail();
    expect(val).toBe(3);
  });
  
  test("ClassWithFailingMethods.failingMemberFunction() [should fail]", () => {
    const c = new fail.ClassWithFailingMethods();
    const val = c.failingMemberFunction();
    expect(val).toBe(3);
  });
});

test("inline function error is source mapped to correct line [should fail]", (): void => {
  const wontAssign = throwsError(); // RUNTIME_ERROR@32:22 STACK_DEPTH:3 EXPECT_IN:inline-utils.ts:33:17 Out of bounds
});

test("single line function failure [should fail]", () => {
  fail.fails();
});
