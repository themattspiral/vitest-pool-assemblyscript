import { test, expect, describe, TestOptions } from '../../../assembly';

describe("primitives", () => {
  test("booleans", () => {
    expect(true).toBeTruthy();
    expect(true).not.toBeFalsy();
    
    expect(false).toBeFalsy();
    expect(false).not.toBeTruthy();
  });
  
  test("integers", () => {
    expect(1).toBeTruthy();
    expect(1).not.toBeFalsy();
    
    expect(0).toBeFalsy();
    expect(0).not.toBeTruthy();

    const a: i64 = -9_876_543_210;
    const b: u32 = 129;
    const c: i16 = 0;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(c).toBeFalsy();
    expect(a).not.toBeFalsy();
    expect(b).not.toBeFalsy();
    expect(c).not.toBeTruthy();
  });
  
  test("floats", () => {
    expect(1.0).toBeTruthy();
    expect(1).not.toBeFalsy();
    
    expect(0.0).toBeFalsy();
    expect(0.0).not.toBeTruthy();

    const a: f64 = -9_876_543_210.123;
    const b: f32 = 129;
    const c: f32 = 0.0;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(c).toBeFalsy();
    expect(a).not.toBeFalsy();
    expect(b).not.toBeFalsy();
    expect(c).not.toBeTruthy();
  });

  test("NaN", () => {
    expect(NaN).toBeFalsy();
  });
});

describe("references", () => {
  test("Non-0-length strings should be truthy", () => {
    expect("hello").toBeTruthy();
    expect("hello").not.toBeFalsy();
  });

  test("0-length strings are ALSO TRUTHY in AssemblyScript!", () => {
    let isStringTruthy: bool = false;
    // @ts-ignore
    if ("") isStringTruthy = true;
    expect(isStringTruthy).toBeTruthy();
    expect(isStringTruthy).not.toBeFalsy();
    
    // @ts-ignore
    const isStringTruthyConditional: bool = "" ? true : false;
    expect(isStringTruthyConditional).toBeTruthy();
    expect(isStringTruthyConditional).not.toBeFalsy();

    expect("").toBeTruthy();
    expect("").not.toBeFalsy();
  });
  
  test("0-length strings are falsey when type-coerced", () => {
    // @ts-ignore
    // unclear why this is different from the explicit conditional,
    // so just documenting it here for now
    const isCoercedStringTruthy: bool = (!!"") == true;
    expect(isCoercedStringTruthy).toBeFalsy();
    expect(isCoercedStringTruthy).not.toBeTruthy();
  });

  test("null references", () => {
    const a: string | null = null;
    const b: TestOptions | null = null;
    expect(a).toBeFalsy();
    expect(a).not.toBeTruthy();
    expect(b).toBeFalsy();
    expect(b).not.toBeTruthy();
  });

  test("bare null", () => {
    expect(null).toBeFalsy();
  });

  test("arrays", () => {
    const a: i32[] = [];
    const b: i32[] = [1, 2, 3];
    const c: i32[] | null = null;

    expect(a).toBeTruthy();
    expect(a).not.toBeFalsy();
    expect(b).toBeTruthy();
    expect(b).not.toBeFalsy();
    expect(c).toBeFalsy();
    expect(c).not.toBeTruthy();
  });

  test("other object references", () => {
    expect(TestOptions.retry(7).timeout(299)).toBeTruthy();
    expect(TestOptions.retry(7).timeout(299)).not.toBeFalsy();
  });
});
