import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import * as fail from "../../assembly-src/failure-utils.meta";
import { callsAnotherFunctionThatFails } from "../../assembly-src/failure-utils-proxy.meta";
import { throwsError } from "../../assembly-src/inline-utils.meta";
import { helperWithFailingAssertion } from "./assertion-helper.meta";

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

describe("edge cases", () => {
  test("inline function [should fail]", (): void => {
    const wontAssign = throwsError();
  });
  
  test("single line function [should fail]", () => {
    fail.failsSingleLine();
  });
  
  test("multiline expect statement [should fail]", (): void => {
    expect(
      false
    ).toBeTruthy();
  });
  
  test("callsAnotherFunctionThatFails [should fail]", (): void => {
    const val = callsAnotherFunctionThatFails();
    expect(val).toBe(3);
  });

  test("assertion error in helper [should fail]", (): void => {
    helperWithFailingAssertion();
  });
});
