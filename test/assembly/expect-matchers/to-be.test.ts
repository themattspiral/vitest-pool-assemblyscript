import { test, expect, describe, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { Point } from '../../assembly-src/user-class-utils';

describe("primitives", () => {
  describe("booleans", () => {
    test("boolean values are identical", () => {
      const a: boolean = true;
      const b: boolean = true;
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: boolean = false;
      expect(c).toBe(c);
      expect(c).not.toBe(a);
      expect(c).not.toBe(b);
    });

    test("boolean values are not identical to numerical equivalents", () => {
      const a: boolean = true;
      const b: u8 = 1;
      const c: f64 = 1.0;
      expect(a).not.toBe(b);
      expect(a).not.toBe(c);
      
      const d: boolean = false;
      const e: u8 = 0;
      const f: f64 = 0.0;
      expect(d).not.toBe(e);
      expect(d).not.toBe(f);
    });
  });

  describe("integers", () => {
    test("same types and values are identical", () => {
      const a: i64 = -9_876_543_210;
      const b: i64 = -9_876_543_210;
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: u8 = 45;
      const d: u8 = 45;
      expect(c).toBe(c);
      expect(c).toBe(d);
    });
    
    test("different types and same signed values are identical", () => {
      const a: i64 = -654_321;
      const b: i32 = -654_321;
      expect(a == b).toBeTruthy();
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: i32 = -29;
      const d: i8 = -29;
      expect(c == d).toBeTruthy();
      expect(c).toBe(d);
    });
    
    test("different types and same unsigned values are identical", () => {
      const a: u64 = 654_321;
      const b: u32 = 654_321;
      expect(a == b).toBeTruthy();
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: u32 = 29;
      const d: u8 = 29;
      expect(c == d).toBeTruthy();
      expect(c).toBe(d);
    });
    
    test("different types and same mixed-sign-type values are identical", () => {
      const a: i64 = 654_321;
      const b: u32 = 654_321;
      expect(a == b).toBeTruthy();
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: u32 = 29;
      const d: i8 = 29;
      expect(c == d).toBeTruthy();
      expect(c).toBe(d);

      const e: i64 = 3_123_456_789;
      const f: u32 = 3_123_456_789;
      expect(e == f).toBeTruthy();
      expect(e).toBe(f);
    });
  });
  
  describe("floats", () => {
    test("same types and values are identical", () => {
      const a: f64 = -9_876_543_210.12345;
      const b: f64 = -9_876_543_210.12345;
      expect(a == b).toBeTruthy();
      expect(a).toBe(a);
      expect(a).toBe(b);

      const c: f32 = 45.12345;
      const d: f32 = 45.12345;
      expect(c == d).toBeTruthy();
      expect(c).toBe(c);
      expect(c).toBe(d);

      const e: f32 = 9 / 7;
      const f: f32 = 9 / 7;
      expect(e == f).toBeTruthy();
      expect(e).toBe(e);
      expect(e).toBe(f);
    });
    
    test("different types with same values (binary representable) are identical", () => {
      const a: f64 = 45.5;
      const b: f32 = 45.5;
      expect(a == b).toBeTruthy();
      expect(a).toBe(b);
    });
    
    test("different types with same values (non-binary-representable) are not identical", () => {
      const a: f64 = 9 / 7;
      const b: f32 = 9 / 7;
      expect(a == b).toBeFalsy();
      expect(a).not.toBe(b);
    });
  });
});

describe("SIMD vectors", () => {
  test("i32x4 with same values are identical", () => {
    const a: v128 = i32x4.splat(42);
    const b: v128 = i32x4.splat(42);
    expect(a).toBe(b);
  });

  test("i32x4 with different values are not identical", () => {
    const a: v128 = i32x4.splat(1);
    const b: v128 = i32x4.splat(2);
    expect(a).not.toBe(b);
  });

  test("f32x4 with same values are identical", () => {
    const a: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    const b: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    expect(a).toBe(b);
  });

  test("f32x4 with different values are not identical", () => {
    const a: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    const b: v128 = f32x4(1.0, 2.0, 3.0, 5.0);
    expect(a).not.toBe(b);
  });

  test("f64x2 with same values are identical", () => {
    const a: v128 = f64x2(3.14, 2.72);
    const b: v128 = f64x2(3.14, 2.72);
    expect(a).toBe(b);
  });

  test("i64x2 with same values are identical", () => {
    const a: v128 = i64x2(100, 200);
    const b: v128 = i64x2(100, 200);
    expect(a).toBe(b);
  });

  test("different lane types with same bit pattern are identical", () => {
    // v128 equality is bitwise — lane type interpretation doesn't matter
    const zeros_i32: v128 = i32x4.splat(0);
    const zeros_f32: v128 = f32x4(0.0, 0.0, 0.0, 0.0);
    const zeros_i64: v128 = i64x2(0, 0);
    const zeros_f64: v128 = f64x2(0.0, 0.0);
    expect(zeros_i32).toBe(zeros_f32);
    expect(zeros_i32).toBe(zeros_i64);
    expect(zeros_i32).toBe(zeros_f64);
    expect(zeros_f32).toBe(zeros_i64);
    expect(zeros_f32).toBe(zeros_f64);
    expect(zeros_i64).toBe(zeros_f64);
  });

  test("different lane types with different bit patterns are not identical", () => {
    // i32 value 1 and f32 value 1.0 have different bit representations
    const int_ones: v128 = i32x4.splat(1);
    const float_ones: v128 = f32x4(1.0, 1.0, 1.0, 1.0);
    expect(int_ones).not.toBe(float_ones);
  });
});

describe("strings", () => {
  test("empty strings are identical", () => {
    expect("").toBe("");
  });
  
  test("same strings are identical", () => {
    expect("hello world!").toBe("hello world!");
  });
  
  test("different strings are not identical", () => {
    expect("hello world!").not.toBe("something else");
  });

  test("nullable strings are identical when null", () => {
    const a: string | null = null;
    const b: string | null = null;
    expect(a).toBe(b);
  });
});

describe("nulls", () => {
  test("null values of any nullable types are identical", () => {
    const a: string | null = null;
    const b: Point | null = null;
    expect(a).toBe(b);
  });
  
  test("explicit null pointer is identical to null value", () => {
    const a: Point | null = null;
    expect(a).toBe(usize(0));
    expect(usize(0)).toBe(a);
  });

  test("0-equivalent values are not identical to null value", () => {
    const a: Point | null = null;
    expect(false).not.toBe(a);
    expect(a).not.toBe(false);

    expect(0).not.toBe(a);
    expect(a).not.toBe(0);
    
    expect(f64(0.0)).not.toBe(a);
    expect(a).not.toBe(f64(0.0));
    
    expect(u64(0.0)).not.toBe(a);
    expect(a).not.toBe(u64(0.0));
    
    expect(u8(0.0)).not.toBe(a);
    expect(a).not.toBe(u8(0.0));
  });

  test("numerical special cases are not identical to null value", () => {
    const a: Point | null = null;
    expect(a).not.toBe(NaN);
    expect(NaN).not.toBe(a);
    
    expect(a).not.toBe(Infinity);
    expect(Infinity).not.toBe(a);
  });

  describe("bare nulls", () => {
    test("bare nulls are identical", () => {
      expect(null).toBe(null);
    });

    test("object is not identical to bare null", () => {
      expect(new Point(1, 2)).not.toBe(null);
      expect(null).not.toBe(new Point(1, 2));
    });
    
    test("null object is identical to bare null", () => {
      const a: Point | null = null;
      expect(a).toBe(null);
      expect(null).toBe(a);
    });
    
    test("explicit null pointer is identical to bare null", () => {
      expect(null).toBe(usize(0));
      expect(usize(0)).toBe(null);
    });

    test("usize zero is null, so it equals other nulls but not other-typed zeros", () => {
      // usize(0) is bare null, so two of them are equal
      expect(usize(0)).toBe(usize(0));

      // ...but it is not equal to a zero of any other numeric type
      expect(usize(0)).not.toBe(0);
      expect(0).not.toBe(usize(0));

      expect(usize(0)).not.toBe(false);
      expect(false).not.toBe(usize(0));

      expect(usize(0)).not.toBe(f64(0.0));
      expect(f64(0.0)).not.toBe(usize(0));

      expect(usize(0)).not.toBe(u64(0.0));
      expect(u64(0.0)).not.toBe(usize(0));

      expect(usize(0)).not.toBe(u8(0.0));
      expect(u8(0.0)).not.toBe(usize(0));
    });

    test("0-equivalent values are not identical to bare null", () => {
      expect(false).not.toBe(null);
      expect(null).not.toBe(false);

      expect(0).not.toBe(null);
      expect(null).not.toBe(0);

      expect(f64(0.0)).not.toBe(null);
      expect(null).not.toBe(f64(0.0));
      
      expect(u64(0.0)).not.toBe(null);
      expect(null).not.toBe(u64(0.0));
      
      expect(u8(0.0)).not.toBe(null);
      expect(null).not.toBe(u8(0.0));
    });

    test("numerical special cases are not identical to bare null", () => {
      expect(null).not.toBe(NaN);
      expect(NaN).not.toBe(null);
      
      expect(null).not.toBe(Infinity);
      expect(Infinity).not.toBe(null);
    });
  });

});

describe("arrays", () => {
  test("same array is identical to itself", () => {
    const x: i32[] = [1, 2, 3];
    expect(x).toBe(x);
  });
  
  test("different arrays with same values are not identical", () => {
    const x: i32[] = [1, 2, 3];
    const y: i32[] = [1, 2, 3];
    expect(x).not.toBe(y);
  });
});

describe("object references", () => {
  test("same reference is identical to itself", () => {
    const a = TestOptions.retry(7).timeout(299);
    expect(a).toBe(a);
  });
  
  test("different objects with same values are not identical", () => {
    const a = TestOptions.retry(7).timeout(299);
    const b = TestOptions.retry(7).timeout(299);
    expect(a).not.toBe(b);
  });
});

describe("edge cases", () => {
  test("global consts should be identical to themselves", () => {
    expect(Infinity).toBe(Infinity);
  });

  test("Number extremes should be identical to themselves", () => {
    expect(F64.POSITIVE_INFINITY).toBe(F64.POSITIVE_INFINITY);
    expect(F64.NEGATIVE_INFINITY).toBe(F64.NEGATIVE_INFINITY);
    expect(F64.POSITIVE_INFINITY).not.toBe(F64.NEGATIVE_INFINITY);
  });

  test("NaN should not be identical to itself", () => {
    // this may seem counterintuitive, but is IEEE 754 standard NaN behavior
    // use toBeNaN() instead!
    expect(NaN).not.toBe(NaN);
    expect(F64.NaN).not.toBe(F64.NaN);
    expect(F32.NaN).not.toBe(F32.NaN);
    expect(NaN).not.toBe(F64.NaN);
    expect(NaN).not.toBe(F32.NaN);
    expect(F32.NaN).not.toBe(F64.NaN);
  });
});

// Incomparable types: combinations where the types cannot be meaningfully compared.
// Reference vs value types throw because they occupy fundamentally different domains.
// Vector vs non-vector types throw because v128 doesn't fit any scalar category.
describe("incomparable types", () => {
  test("string vs i32 throws", () => {
    expect(() => {
      expect("hello").toBe(42);
    }).toThrowError("reference and value types are not comparable");
  });

  test("i32 vs string throws", () => {
    expect(() => {
      expect(42).toBe("hello");
    }).toThrowError("reference and value types are not comparable");
  });

  test("v128 vs i32 throws", () => {
    expect(() => {
      expect(i32x4.splat(1)).toBe(1);
    }).toThrowError("incompatible types");
  });

  test("i32 vs v128 throws", () => {
    expect(() => {
      expect(1).toBe(i32x4.splat(1));
    }).toThrowError("incompatible types");
  });
});
