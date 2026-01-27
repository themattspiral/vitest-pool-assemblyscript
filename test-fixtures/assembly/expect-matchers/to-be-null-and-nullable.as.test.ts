import { test, expect, describe, TestOptions } from '../../../assembly';

describe("primitives", () => {
  test("should always be non-nullable and non-null", () => {
    expect(true).not.toBeNullable();
    expect(true).not.toBeNull();
    expect(false).not.toBeNullable();
    expect(false).not.toBeNull();
    
    expect(0).not.toBeNullable();
    expect(0).not.toBeNull();
    expect(1).not.toBeNullable();
    expect(1).not.toBeNull();

    expect(u64(0.0)).not.toBeNullable();
    expect(u64(0.0)).not.toBeNull();
    
    expect(i8(-4)).not.toBeNullable();
    expect(i8(-4)).not.toBeNull();

    expect(u8(0.0)).not.toBeNullable();
    expect(u8(0.0)).not.toBeNull();

    expect(Infinity).not.toBeNullable();
    expect(Infinity).not.toBeNull();

    expect(NaN).not.toBeNullable();
    expect(NaN).not.toBeNull();
  });
});

describe("references", () => {
  test("strings", () => {
    expect("hello").not.toBeNullable();
    expect("hello").not.toBeNull();
    
    let val: string | null = "hello";
    expect(val).toBeNullable();
    expect(val).not.toBeNull();

    val = null;
    expect(val).toBeNull();
  });

  test("arrays", () => {
    const a: i32[] = [];
    const b: i32[] = [1, 2, 3];
    let c: i32[] | null = [1, 2, 3, 4];

    expect(a).not.toBeNullable();
    expect(a).not.toBeNull();
    expect(b).not.toBeNullable();
    expect(b).not.toBeNull();
    expect(c).toBeNullable();
    expect(c).not.toBeNull();

    c = null;
    expect(c).toBeNull();
  });

  test("custom object references", () => {
    expect(TestOptions.retry(7).timeout(299)).not.toBeNullable;

    let val: TestOptions | null = TestOptions.retry(7).timeout(299);
    expect(val).toBeNullable();
    expect(val).not.toBeNull();

    val = null;
    expect(val).toBeNull();
  });
});
