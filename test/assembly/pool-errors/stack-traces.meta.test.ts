import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import * as fail from "../../assembly-src/failure-utils.meta";
import { callsAnotherFunctionThatFails } from "../../assembly-src/failure-utils-proxy.meta";
import { inlineFails } from "../../assembly-src/inline-utils.meta";
import * as helpers from "./assertion-helper.meta";
import { runFailingUserFunction, runFailingUserFunctionNonexistantRef, runFailingUserFunctionStackOverflow } from '../../assembly-src/user-import-error-wrapper.meta';

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
  test("inline function [should fail]", () => {
    const wontAssign = inlineFails();
  });
  
  test("single line function [should fail]", () => {
    fail.failsSingleLine();
  });
  
  test("multiline expect statement [should fail]", () => {
    expect(
      false
    ).toBeTruthy();
  });
  
  test("callsAnotherFunctionThatFails [should fail]", () => {
    const val = callsAnotherFunctionThatFails();
    expect(val).toBe(3);
  });

  test("assertion error in test helper [should fail]", () => {
    helpers.testHelperWithFailingAssertion();
  });
  
  test("runtime error in test helper [should fail]", () => {
    const val = helpers.testHelperWithRuntimeAbort();
    expect(val).toBe(1);
  });

  describe("WASM crash error paths (not handled by abort import)", () => {
    test("stack overflow in user code [should fail]", () => {
      const val = fail.crash(1, "anything");
      expect(val).toBe("anything");
    });
    
    test("stack overflow in user class code [should fail]", () => {
      const c = new fail.ClassWithFailingMethods();
      const val = c.crash(1, "anything");
      expect(val).toBe("anything");
    });
    
    test("stack overflow in test helper [should fail]", () => {
      const val = helpers.testHelperWithStackOverflowCrash(1, "anything");
      expect(val).toBe("anything");
    });

    test("memory out of bounds runtime error [should fail]", () => {
      const val = fail.badLoad();
      expect(val).toBe(12);
    });
    
    test("divide by zero runtime error [should fail]", () => {
      const val = fail.badDiv();
      expect(val).toBeCloseTo(12);
    });
  });

  describe("user imports", () => {
    test("range runtime error [should fail]", () => {
      expect(runFailingUserFunction(2)).toBe(12);
    });
    
    test("reference runtime error [should fail]", () => {
      expect(runFailingUserFunctionNonexistantRef(2)).toBe(12);
    });
    
    test("stack overflow runtime error [should fail]", () => {
      expect(runFailingUserFunctionStackOverflow(2)).toBe(12);
    });
  });
});
