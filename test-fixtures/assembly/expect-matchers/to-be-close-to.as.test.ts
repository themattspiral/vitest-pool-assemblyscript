import { test, expect, describe, TestOptions } from '../../../assembly';

describe("primitives", () => {
  describe("booleans", () => {
    test("should be close to correct numerical equivalents", () => {
      const a: boolean = true;
      const b: u8 = 1;
      const c: f64 = 1.0;
      expect(a).toBeCloseTo(a);
      expect(a).toBeCloseTo(b);
      expect(a).toBeCloseTo(c);
      expect(b).toBeCloseTo(c);
      
      const d: boolean = false;
      const e: u8 = 0;
      const f: f64 = 0.0;
      expect(d).toBeCloseTo(d);
      expect(d).toBeCloseTo(e);
      expect(d).toBeCloseTo(f);
      expect(e).toBeCloseTo(f);
    });
  });

  describe("integers", () => {
    test("same values are close to each other", () => {
      const a: i64 = -9_876_543_210;
      const b: i64 = -9_876_543_210;
      expect(a).toBeCloseTo(b);
      
      const c: i8 = 45;
      const d: u32 = 45;
      expect(c).toBeCloseTo(d);
    });
    
    test("different values are not close to each other", () => {
      const a: i64 = -9_876_543_210;
      const b: i64 = -9_876_543_211;
      expect(a).not.toBeCloseTo(b);
      
      const c: i8 = 45;
      const d: u32 = 46;
      expect(c).not.toBeCloseTo(d);
    });
  });
  
  describe("floats", () => {
    test("same types and values are close to each other", () => {
      const a: f64 = -9_876_543_210.12345;
      const b: f64 = -9_876_543_210.12345;
      expect(a).toBeCloseTo(a);
      expect(a).toBeCloseTo(b);

      const c: f32 = 45.12345;
      const d: f32 = 45.12345;
      expect(c).toBeCloseTo(c);
      expect(c).toBeCloseTo(d);

      const e: f32 = 9 / 7;
      const f: f32 = 9 / 7;
      expect(e).toBeCloseTo(e);
      expect(e).toBeCloseTo(f);
    });
    
    test("same types with close values are close to each other with default precision", () => {
      const a: f64 = 0.1 + 0.2;
      const b: f64 = 0.3;
      expect(a).toBeCloseTo(b);
    });
    
    test("same types with close values are not close to each other with higher precision", () => {
      const a: f64 = 0.1 + 0.2;
      const b: f64 = 0.3;
      expect(a).toBeCloseTo(b, 15);
      expect(a).not.toBeCloseTo(b, 16);
    });

    test("different types with close values are close to each other with default precision", () => {
      const a: f64 = 0.1 + 0.2;
      const b: f32 = 0.3;
      expect(a).toBeCloseTo(b);
    });
    
    test("different types with close values are close to each other with higher precision", () => {
      const a: f64 = 0.1 + 0.2;
      const b: f32 = 0.3;
      expect(a).toBeCloseTo(b, 7);
      expect(a).not.toBeCloseTo(b, 8);
    });
    
    test("different types with same values (binary representable) are close to each other", () => {
      const a: f64 = 45.5;
      const b: f32 = 45.5;
      expect(a).toBeCloseTo(b);
    });
    
    test("different types with same values (non-binary-representable) are close to each other with default precision", () => {
      const a: f64 = 9 / 7;
      const b: f32 = 9 / 7;
      expect(a).toBeCloseTo(b);
    });
    
    test("different types with same values (non-binary-representable) are not close to each other with higher precision", () => {
      const a: f64 = 9 / 7;
      const b: f32 = 9 / 7;
      expect(a).toBeCloseTo(b, 7);
      expect(a).not.toBeCloseTo(b, 8);
    });
  });
});

describe("floats and integers together", () => {
  test("different types with same values are close to each other", () => {
    const a: i64 = 654_321;
    const b: f32 = 654_321.0;
    expect(a).toBeCloseTo(b);
    
    const c: f64 = 29.0;
    const d: u8 = 29;
    expect(c).toBeCloseTo(d);

    const e: f64 = -40096.0;
    const f: i32 = -40096;
    expect(e).toBeCloseTo(f);
  });
  
  test("different types with close values are close to each other with default precision", () => {
    const a: u8 = 3;
    const b: f64 = 0.6 / 0.2;
    expect(a).not.toBe(b);
    expect(a).toBeCloseTo(b);

    const c: f32 = -0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1;
    const d: i32 = -1;
    expect(c).not.toBe(d);
    expect(c).toBeCloseTo(d);
  });
  
  test("different types with close values are not close to each other using higher precision", () => {
    const a: u8 = 3;
    const b: f64 = 0.6 / 0.2;
    expect(a).toBeCloseTo(b, 15);
    expect(a).not.toBeCloseTo(b, 16);

    const c: f32 = -0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1 - 0.1;
    const d: i32 = -1;
    expect(c).toBeCloseTo(d, 6);
    expect(c).not.toBeCloseTo(d, 7);
  });
});

// describe("SIMD vectors", () => {
//   // TODO
// });

// describe("strings", () => {
//   test("empty strings are identical", () => {
//     expect("").toBe("");
//   });
  
//   test("same strings are identical", () => {
//     expect("hello world!").toBe("hello world!");
//   });
  
//   test("different strings are not identical", () => {
//     expect("hello world!").not.toBe("something else");
//   });

//   test("nullable strings are identical when null", () => {
//     const a: string | null = null;
//     const b: string | null = null;
//     expect(a).toBe(b);
//   });
// });

// describe("nullables", () => {
//   test("values of any nullable types are identical when null", () => {
//     const a: string | null = null;
//     const b: TestOptions | null = null;
//     expect(a).toBe(b);
//   });
// });

// describe("arrays", () => {
//   test('same array is identical to itself', () => {
//     const x: i32[] = [1, 2, 3];
//     expect(x).toBe(x);
//   });
  
//   test('different arrays with same values are not identical', () => {
//     const x: i32[] = [1, 2, 3];
//     const y: i32[] = [1, 2, 3];
//     expect(x).not.toBe(y);
//   });
// });

// describe("object references", () => {
//   test('same reference is identical to itself', () => {
//     const a = TestOptions.retry(7).timeout(299);
//     expect(a).toBe(a);
//   });
  
//   test('different objects with same values are not identical', () => {
//     const a = TestOptions.retry(7).timeout(299);
//     const b = TestOptions.retry(7).timeout(299);
//     expect(a).not.toBe(b);
//   });
// });
