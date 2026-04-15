import { test, expect, describe, TestOptions } from "vitest-pool-assemblyscript/assembly";

describe("booleans", () => {
  test("booleans should be equal to their correct numerical equivalents", () => {
    expect(true).toEqual(u8(1));
    expect(true).toEqual(f32(1.0));
    expect(true).toEqual(f64(1.0));
    expect(u8(1)).toEqual(true);
    expect(f32(1.0)).toEqual(true);
    expect(f64(1.0)).toEqual(true);
    
    expect(false).toEqual(u8(0));
    expect(false).toEqual(f32(0.0));
    expect(false).toEqual(f64(0.0));
    expect(u8(0)).toEqual(false);
    expect(f32(0.0)).toEqual(false);
    expect(f64(0.0)).toEqual(false);
  });
});

describe("builtin edge cases", () => {
  test("global consts should be equal to themselves", () => {
    expect(Infinity).toEqual(Infinity);
  });

  test("Number extremes should be equal to themselves", () => {
    expect(F64.POSITIVE_INFINITY).toEqual(F64.POSITIVE_INFINITY);
    expect(F64.NEGATIVE_INFINITY).toEqual(F64.NEGATIVE_INFINITY);
    expect(F64.POSITIVE_INFINITY).not.toEqual(F64.NEGATIVE_INFINITY);
  });

  test("NaN should not be equal to itself", () => {
    // this may seem counterintuitive, but is IEEE 754 standard NaN behavior
    // use toBeNaN() instead!
    expect(NaN).not.toEqual(NaN);
    expect(F64.NaN).not.toEqual(F64.NaN);
    expect(F32.NaN).not.toEqual(F32.NaN);
    expect(NaN).not.toEqual(F64.NaN);
    expect(NaN).not.toEqual(F32.NaN);
    expect(F32.NaN).not.toEqual(F64.NaN);
  });
});

describe("strings", () => {
  test("empty strings are equal", () => {
    expect("").toEqual("");
  });
  
  test("same strings are equal", () => {
    expect("hello world!").toEqual("hello world!");
  });
  
  test("different strings are not equal", () => {
    expect("hello world!").not.toEqual("something else");
  });

  test("nullable strings are equal when null", () => {
    const a: string | null = null;
    const b: string | null = null;
    expect(a).toEqual(b);
  });
});

describe("SIMD vectors", () => {
  test("i32x4 with same values are equal", () => {
    const a: v128 = i32x4.splat(42);
    const b: v128 = i32x4.splat(42);
    expect(a).toEqual(b);
  });

  test("i32x4 with different values are not equal", () => {
    const a: v128 = i32x4.splat(1);
    const b: v128 = i32x4.splat(2);
    expect(a).not.toEqual(b);
  });

  test("f32x4 with same values are equal", () => {
    const a: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    const b: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    expect(a).toEqual(b);
  });

  test("f64x2 with same values are equal", () => {
    const a: v128 = f64x2(3.14, 2.72);
    const b: v128 = f64x2(3.14, 2.72);
    expect(a).toEqual(b);
  });

  test("different lane types with same bit pattern are equal", () => {
    const zeros_i32: v128 = i32x4.splat(0);
    const zeros_f32: v128 = f32x4(0.0, 0.0, 0.0, 0.0);
    const zeros_i64: v128 = i64x2(0, 0);
    const zeros_f64: v128 = f64x2(0.0, 0.0);
    expect(zeros_i32).toEqual(zeros_f32);
    expect(zeros_i32).toEqual(zeros_i64);
    expect(zeros_i32).toEqual(zeros_f64);
  });
});

describe("nulls", () => {
  describe("bare nulls", () => {
    test("nulls are equal", () => {
      expect(null).toEqual(null);
    });
  });
  
  describe("nullables", () => {
    // TODO - decide if this is correct
    test("values of any nullable types are equal when null", () => {
      const a: string | null = null;
      const b: TestOptions | null = null;
      expect(a).toEqual(b);
    });
  });
  
  test("0-equivalent values should equal null", () => {
    // these will pass a loose toEqual(null), but not strict toBeNull()
    expect(false).toEqual(null);
    expect(0).toEqual(null);
    expect(f64(0.0)).toEqual(null);
    expect(u64(0.0)).toEqual(null);
    expect(u8(0.0)).toEqual(null);
    expect(null).toEqual(false);
    expect(null).toEqual(0);
    expect(null).toEqual(f64(0.0));
    expect(null).toEqual(u64(0.0));
    expect(null).toEqual(u8(0.0));
  });
});

// toEqual follows the same float/integer type restrictions as toBe.
// See to-be-mixed-numerical-types.as.test.ts for the full comparison matrix.
const PRECISION_ERROR_SUBSTRING = "float precision is insufficient";

describe("unsupported float/integer comparisons", () => {
  test("f32 vs i32 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(i32(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i32(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs i64 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(i64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i64(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u32 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(u32(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u32(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u64 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(u64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u64(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f64 vs i64 throws", () => {
    expect(() => { expect(f64(42.0)).toEqual(i64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i64(42)).toEqual(f64(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f64 vs u64 throws", () => {
    expect(() => { expect(f64(42.0)).toEqual(u64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u64(42)).toEqual(f64(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });
});

// Precision loss edge cases — demonstrates WHY the above combinations are rejected.
// See to-be-mixed-numerical-types.as.test.ts for the full set of precision loss demos.
describe("precision loss false positives", () => {
  test("f64 cannot distinguish i64 values above 2^53", () => {
    const a: i64 = 9007199254740992;  // 2^53
    const b: i64 = 9007199254740993;  // 2^53 + 1

    expect(a == b).toBeFalsy();
    expect(f64(a)).toEqual(f64(b));
  });

  test("f32 cannot distinguish i32 values above 2^24", () => {
    const a: i32 = 16777216;  // 2^24
    const b: i32 = 16777217;  // 2^24 + 1

    expect(a == b).toBeFalsy();
    expect(f32(a)).toEqual(f32(b));
  });
});

// Incomparable types: combinations where the types cannot be meaningfully compared.
// Reference vs value types throw because they occupy fundamentally different domains.
// Vector vs non-vector types throw because v128 doesn't fit any scalar category.
describe("incomparable types", () => {
  test("string vs i32 throws", () => {
    expect(() => {
      expect("hello").toEqual(42);
    }).toThrowError("reference and value types are not comparable");
  });

  test("i32 vs string throws", () => {
    expect(() => {
      expect(42).toEqual("hello");
    }).toThrowError("reference and value types are not comparable");
  });

  test("v128 vs i32 throws", () => {
    expect(() => {
      expect(i32x4.splat(1)).toEqual(1);
    }).toThrowError("incompatible types");
  });

  test("i32 vs v128 throws", () => {
    expect(() => {
      expect(1).toEqual(i32x4.splat(1));
    }).toThrowError("incompatible types");
  });
});
