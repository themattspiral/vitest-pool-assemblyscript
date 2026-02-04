import { test, expect, describe, TestOptions } from "vitest-pool-assemblyscript/assembly";

describe("success", () => {
  test("global NaN is NaN", () => {
    expect(NaN).toBeNaN();
  });
  
  test("Float NaN is NaN", () => {
    expect(F32.NaN).toBeNaN();
    expect(F64.NaN).toBeNaN();
  });

  test("global Infinity is not NaN", () => {
    expect(Infinity).not.toBeNaN();
  });

  test("Number extremes and are not NaN", () => {
    expect(F64.EPSILON).not.toBeNaN();
    expect(F64.MAX_VALUE).not.toBeNaN();
    expect(F64.MIN_VALUE).not.toBeNaN();
    expect(F64.MIN_SAFE_INTEGER).not.toBeNaN();
    expect(F64.MAX_SAFE_INTEGER).not.toBeNaN();
    expect(F64.NEGATIVE_INFINITY).not.toBeNaN();
    expect(F64.POSITIVE_INFINITY).not.toBeNaN();

    expect(U64.MIN_VALUE).not.toBeNaN();
    expect(U64.MAX_VALUE).not.toBeNaN();
  });
  
  test("primitives are not NaN", () => {
    expect(u8(0)).not.toBeNaN();
    expect(u64(0)).not.toBeNaN();
    expect(i8(0)).not.toBeNaN();
    expect(i64(0)).not.toBeNaN();
    expect(f32(0)).not.toBeNaN();
    expect(f64(0)).not.toBeNaN();
    expect(u8(1)).not.toBeNaN();
    expect(u64(1)).not.toBeNaN();
    expect(i8(-1)).not.toBeNaN();
    expect(i8(1)).not.toBeNaN();
    expect(i64(1)).not.toBeNaN();
    expect(f32(1.0)).not.toBeNaN();
    expect(f64(1.0)).not.toBeNaN();
    expect(true).not.toBeNaN();
    expect(false).not.toBeNaN();
  });

  test("strings are not NaN", () => {
    let str: string | null = "something";
    expect(str).not.toBeNaN();

    str = null;
    expect(str).not.toBeNaN();
  });

  test("nullable references are not NaN", () => {
    let opts: TestOptions | null = TestOptions.retry(9);
    expect(opts).not.toBeNaN();
    
    opts = null;
    expect(opts).not.toBeNaN();
  });
  
  test("bare null is not NaN", () => {
    expect(null).not.toBeNaN();
  });
});

describe("failure", () => {
  
});
