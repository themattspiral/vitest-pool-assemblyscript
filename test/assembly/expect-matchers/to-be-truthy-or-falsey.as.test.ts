import { test, expect, describe, TestOptions } from '../../../assembly';

describe("primitives", () => {
  test("booleans", () => {
    expect(true).toBeTruthy();
    expect(true).not.toBeFalsey();
    
    expect(false).toBeFalsey();
    expect(false).not.toBeTruthy();
  });
  
  test("integers", () => {
    expect(1).toBeTruthy();
    expect(1).not.toBeFalsey();
    
    expect(0).toBeFalsey();
    expect(0).not.toBeTruthy();

    const a: i64 = -9_876_543_210;
    const b: u32 = 129;
    const c: i16 = 0;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(c).toBeFalsey();
    expect(a).not.toBeFalsey();
    expect(b).not.toBeFalsey();
    expect(c).not.toBeTruthy();
  });
  
  test("floats", () => {
    expect(1.0).toBeTruthy();
    expect(1).not.toBeFalsey();
    
    expect(0.0).toBeFalsey();
    expect(0.0).not.toBeTruthy();

    const a: f64 = -9_876_543_210.123;
    const b: f32 = 129;
    const c: f32 = 0.0;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(c).toBeFalsey();
    expect(a).not.toBeFalsey();
    expect(b).not.toBeFalsey();
    expect(c).not.toBeTruthy();
  });

  test("strings", () => {
    expect("hello").toBeTruthy();
    expect("hello").not.toBeFalsey();
    
    expect("").toBeFalsey();
    expect("").not.toBeTruthy();
  });

  test("null references", () => {
    const a: string | null = null;
    const b: TestOptions | null = null;
    expect(a).toBeFalsey();
    expect(a).not.toBeTruthy();
    expect(b).toBeFalsey();
    expect(b).not.toBeTruthy();
  });

  test("bare null", () => {
    expect(null).toBeFalsey();
  });

  test("NaN", () => {
    expect(NaN).toBeFalsey();
  });

  test("arrays", () => {
    const a: i32[] = [];
    const b: i32[] = [1, 2, 3];
    const c: i32[] | null = null;

    expect(a).toBeTruthy();
    expect(a).not.toBeFalsey();
    expect(b).toBeTruthy();
    expect(b).not.toBeFalsey();
    expect(c).toBeFalsey();
    expect(c).not.toBeTruthy();
  });

  test("object references", () => {
    expect(TestOptions.retry(7).timeout(299)).toBeTruthy();
    expect(TestOptions.retry(7).timeout(299)).not.toBeFalsey();
  });
});
