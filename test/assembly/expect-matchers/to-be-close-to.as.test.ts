import { test, expect, describe } from "../../../assembly";

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
    
    test("different values are not close to each other at standard or higher precision", () => {
      const a: i64 = -9_876_543_210;
      const b: i64 = -9_876_543_211;
      expect(a).not.toBeCloseTo(b);
      
      const c: i8 = 45;
      const d: u32 = 46;
      expect(c).not.toBeCloseTo(d, 50);
    });

    test("different values are close to each other at negative precision", () => {
      // Precision of -5 means within 50000 is close
      expect(1.0).toBeCloseTo(2.0, -5);
      expect(7).toBeCloseTo(50006, -5);
      expect(7).not.toBeCloseTo(50007, -5);
    });
    
    test("different u64 values are close to each other at negative precision", () => {
      const a: u64 = 17_654_987_123_321_123_321;
      const b: u64 = 17_654_987_123_321_123_322;
      const c: u64 = 18_000_000_000_000_000_000;

      // Precision of -5 means within 50000 is close
      expect(a).toBeCloseTo(b, -5);
      expect(a).not.toBeCloseTo(c, -5);
    });
  });
  
  describe("floats", () => {
    describe("default precision", () => {
      test("same types and values", () => {
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

      test("different types with same values (binary representable)", () => {
        const a: f64 = 45.5;
        const b: f32 = 45.5;
        expect(a).toBeCloseTo(b);
      });

      test("different types with same values (non-binary-representable)", () => {
        const a: f64 = 9 / 7;
        const b: f32 = 9 / 7;
        expect(a).toBeCloseTo(b);
      });

      test("same types with close values", () => {
        const a: f64 = 0.1 + 0.2;
        const b: f64 = 0.3;
        expect(a).toBeCloseTo(b);
      });

      test("different types with close values", () => {
        const a: f64 = 0.1 + 0.2;
        const b: f32 = 0.3;
        expect(a).toBeCloseTo(b);
      });

    });
    
    describe("higher precision", () => {
      test("same types and values are close to each other regardless of precision", () => {
        const a: f64 = -9_876_543_210.12345;
        const b: f64 = -9_876_543_210.12345;
        expect(a).toBeCloseTo(a, 50);
        expect(a).toBeCloseTo(b, 50);

        const c: f32 = 45.12345;
        const d: f32 = 45.12345;
        expect(c).toBeCloseTo(c, 50);
        expect(c).toBeCloseTo(d, 50);

        const e: f32 = 9 / 7;
        const f: f32 = 9 / 7;
        expect(e).toBeCloseTo(e, 50);
        expect(e).toBeCloseTo(f, 50);
      });

      test("same types with close values are not close to each other over precision threshold", () => {
        const a: f64 = 0.1 + 0.2;
        const b: f64 = 0.3;
        expect(a).toBeCloseTo(b, 15);
        expect(a).not.toBeCloseTo(b, 16);
      });

       test("different types with close values are not close to each other over precision threshold", () => {
        const a: f64 = 0.1 + 0.2;
        const b: f32 = 0.3;
        expect(a).toBeCloseTo(b, 7);
        expect(a).not.toBeCloseTo(b, 8);
      });

      test("different types with same values (binary representable)", () => {
        const a: f64 = 45.5;
        const b: f32 = 45.5;
        expect(a).toBeCloseTo(b, 50);
      });

      test("different types with same values (non-binary-representable) are not close to each other over precision threshold", () => {
        const a: f64 = 9 / 7;
        const b: f32 = 9 / 7;
        expect(a).toBeCloseTo(b, 7);
        expect(a).not.toBeCloseTo(b, 8);
      });
    });

    describe("0 precision", () => {
      test("Precision of 0 means within 0.5 is close", () => {
        expect(0.3).toBeCloseTo(f64(0.7999999999999), 0);
        expect(0.3).not.toBeCloseTo(f64(0.8), 0);
        
        expect(0.3).toBeCloseTo(f64(-0.1999999999999), 0);
        expect(0.3).not.toBeCloseTo(f64(-0.2), 0);
      });
    });
    
    describe("negative precision floats", () => {
      test("Precision of -5 means within 50000 is close", () => {
        expect(1.0).toBeCloseTo(2.0, -5);
        expect(7).toBeCloseTo(50006.0, -5);
        expect(7).not.toBeCloseTo(50007.0, -5);
      });
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
