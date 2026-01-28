import { test, expect, describe, TestOptions } from "../../../assembly";

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
    
    test("boolean values are identical when converted to integers", () => {
      const a: boolean = true;
      const b: u64 = u64(true);
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: u16 = u16(false);
      const d: boolean = false;
      expect(c).toBe(c);
      expect(d).toBe(d);
      expect(c).toBe(d);
      expect(c).not.toBe(a);
      expect(c).not.toBe(b);
    });
    
    test("boolean values are identical when converted to floats", () => {
      const a: boolean = true;
      const b: f32 = f32(true);
      expect(a).toBe(a);
      expect(a).toBe(b);
    });

    test("boolean values are identical to correct numerical equivalents", () => {
      const a: boolean = true;
      const b: u8 = 1;
      const c: f64 = 1.0;
      expect(a).toBe(b);
      expect(a).toBe(c);
      expect(b).toBe(c);
      
      const d: boolean = false;
      const e: u8 = 0;
      const f: f64 = 0.0;
      expect(d).toBe(e);
      expect(d).toBe(f);
      expect(e).toBe(f);
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
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: i32 = -29;
      const d: i8 = -29;
      expect(c).toBe(d);
    });
    
    test("different types and same unsigned values are identical", () => {
      const a: u64 = 654_321;
      const b: u32 = 654_321;
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: u32 = 29;
      const d: u8 = 29;
      expect(c).toBe(d);
    });
    
    test("different types and same mixed-sign-type values are identical", () => {
      const a: i64 = 654_321;
      const b: u32 = 654_321;
      expect(a).toBe(a);
      expect(a).toBe(b);
      
      const c: u32 = 29;
      const d: i8 = 29;
      expect(c).toBe(d);

      const e: i64 = 3_123_456_789;
      const f: u32 = 3_123_456_789;
      expect(e).toBe(f);
    });
  });
  
  describe("floats", () => {
    test("same types and values are identical", () => {
      const a: f64 = -9_876_543_210.12345;
      const b: f64 = -9_876_543_210.12345;
      expect(a).toBe(a);
      expect(a).toBe(b);

      const c: f32 = 45.12345;
      const d: f32 = 45.12345;
      expect(c).toBe(c);
      expect(c).toBe(d);

      const e: f32 = 9 / 7;
      const f: f32 = 9 / 7;
      expect(e).toBe(e);
      expect(e).toBe(f);
    });
    
    test("different types with same values (binary representable) are identical", () => {
      const a: f64 = 45.5;
      const b: f32 = 45.5;
      expect(a).toBe(b);
    });
    
    test("different types with same values (non-binary-representable) are not identical", () => {
      const a: f64 = 9 / 7;
      const b: f32 = 9 / 7;
      expect(a).not.toBe(b);
    });
  });
});

describe("floats and integers together", () => {
  test("different types with same values are identical", () => {
    const a: i64 = 654_321;
    const b: f32 = 654_321.0;
    expect(a).toBe(b);
    
    const c: f64 = 29.0;
    const d: u8 = 29;
    expect(c).toBe(d);

    const e: f64 = -40096.0;
    const f: i32 = -40096;
    expect(e).toBe(f);
  });
});

describe("SIMD vectors", () => {
  // TODO
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

describe("nullables", () => {
  test("values of any nullable types are identical when null", () => {
    const a: string | null = null;
    const b: TestOptions | null = null;
    expect(a).toBe(b);
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
