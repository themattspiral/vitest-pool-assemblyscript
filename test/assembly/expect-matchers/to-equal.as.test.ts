import { test, expect, describe, TestOptions } from 'vitest-pool-assemblyscript/assembly';

describe("primitives", () => {
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

  test("booleans should be equal correct numerical equivalents", () => {
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

describe("edge cases", () => {
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

describe("arrays", () => {
  test('arrays with same values are equal', () => {
    const a: i32[] = [1, 2, 3, 4, 5];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).toEqual(b);
    expect(a).toStrictEqual(b);
  });
  
  test('arrays with different int types with same values are equal', () => {
    const a: u64[] = [1, 9, 37, 2];
    const b: i8[] = [1, 9, 37, 2];
    // NOTE: This behavior differs from JS expect.toBeCloseTo
    expect(a).toEqual(b);
  });
  
  test('arrays with different float types with same values (binary representable) are equal', () => {
    const a: f64[] = [22.5];
    const b: f32[] = [22.5];
    expect(a).toEqual(b);
  });
  
  test('arrays with different float types with same values (non binary representable) are not equal', () => {
    const a: f64[] = [22.12345];
    const b: f32[] = [22.12345];
    expect(a).not.toEqual(b);
  });
  
  test('arrays with same values in different order are not equal', () => {
    const a: i32[] = [2, 4, 5, 1, 3];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).not.toEqual(b);
  });
  
  test('arrays with different values are not equal', () => {
    const a: i32[] = [1, 5, 5, 9, 9];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).not.toEqual(b);
  });

  test('arrays with different lengths are not equal', () => {
    const a: u8[] = [1, 5, 5, 9, 9, 1];
    const b: u8[] = [1, 5, 5, 9, 9];
    expect(a).not.toEqual(b);
  });

  test('arrays of equal strings are equal', () => {
    const a: string[] = ["one", "two", "three"];
    const b: string[] = ["one", "two", "three"];
    expect(a).toEqual(b);
  });
  
  test('arrays of different strings are not equal', () => {
    const a: string[] = ["one", "two", "three"];
    const b: string[] = ["one", "two", "three", "four"];
    const c: string[] = ["one", "2", "three"];
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(c);
  });
});

describe("maps", () => {
  // TODO
});

describe("sets", () => {
  // TODO
});

describe("ArrayBuffer", () => {
  // TODO
});

const OBJ_REF_ERROR = "Deep equality comparison of user-defined reference types is not yet implemented";

describe("user defined objects", () => {  
  test("object reference comparison throws for value-equal but different refs", () => {
    expect(() => {
      expect(TestOptions.retry(2)).toEqual(TestOptions.retry(2));
    }).toThrowError(OBJ_REF_ERROR);
  });
});

describe("nulls", () => {
  test("nulls are equal", () => {
    expect(null).toEqual(null);
  });
});

describe("nullables", () => {
  test("values of any nullable types are equal when null", () => {
    const a: string | null = null;
    const b: TestOptions | null = null;
    expect(a).toEqual(b);
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
