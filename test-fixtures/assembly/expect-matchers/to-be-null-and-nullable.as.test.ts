import { test, expect, describe, TestOptions } from '../../../assembly';

describe("primitives", () => {
  test("bare nulls should be null", () => {
    expect(null).toBeNull();
  });

  test("other primitives should always be non-nullable and non-null", () => {
    expect(true).not.toBeNull();
    expect(true).not.toBeNullable();
    expect(1).not.toBeNull();
    expect(1).not.toBeNullable();
    
    expect(i8(-4)).not.toBeNull();
    expect(i8(-4)).not.toBeNullable();

    expect(Infinity).not.toBeNull();
    expect(Infinity).not.toBeNullable();

    expect(NaN).not.toBeNull();
    expect(NaN).not.toBeNullable();
  });

  test("0-equivalent values should also be non-nullable and non-null", () => {
    // these will pass a loose toEqual(null), but not strict toBeNull()
    expect(false).not.toBeNull();
    expect(false).not.toBeNullable();
    expect(0).not.toBeNull();
    expect(0).not.toBeNullable();
    expect(f64(0.0)).not.toBeNull();
    expect(f64(0.0)).not.toBeNullable();
    expect(f32(0.0)).not.toBeNull();
    expect(f32(0.0)).not.toBeNullable();
    expect(u64(0.0)).not.toBeNull();
    expect(u64(0.0)).not.toBeNullable();
    expect(u8(0.0)).not.toBeNull();
    expect(u8(0.0)).not.toBeNullable();
  });
});

describe("references", () => {
  test("strings", () => {
    expect("hello").not.toBeNull();
    expect("hello").not.toBeNullable();
    
    let val: string | null = "hello";
    expect(val).not.toBeNull();
    expect(val).toBeNullable();

    val = null;
    expect(val).toBeNull();
  });

  test("arrays", () => {
    const a: i32[] = [];
    const b: i32[] = [1, 2, 3];
    let c: i32[] | null = [1, 2, 3, 4];

    expect(a).not.toBeNull();
    expect(a).not.toBeNullable();
    expect(b).not.toBeNull();
    expect(b).not.toBeNullable();
    expect(c).not.toBeNull();
    expect(c).toBeNullable();

    c = null;
    expect(c).toBeNull();
  });

  test("custom object references", () => {
    expect(TestOptions.retry(7).timeout(299)).not.toBeNull();
    expect(TestOptions.retry(7).timeout(299)).not.toBeNullable();

    let val: TestOptions | null = TestOptions.retry(7).timeout(299);
    expect(val).not.toBeNull();
    expect(val).toBeNullable();

    val = null;
    expect(val).toBeNull();
  });
});
