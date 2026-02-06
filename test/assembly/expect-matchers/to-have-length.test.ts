import { test, expect, describe, TestOptions } from "vitest-pool-assemblyscript/assembly";

describe("arrays", () => {
  test("empty arrays should have length 0", () => {
    expect([]).toHaveLength(0);
    expect([]).not.toHaveLength(1);
    
    expect(new Array<i32>()).toHaveLength(0);
    expect(new Array<i32>()).not.toHaveLength(1);
  });
  
  test("null arrays should not have any length", () => {
    expect(null).not.toHaveLength(0);
    expect(null).not.toHaveLength(1);

    let anArray: i32[] | null = [];
    expect(anArray).toHaveLength(0);
    anArray = null;
    expect(anArray).not.toHaveLength(0);
    expect(anArray).not.toHaveLength(1);
  });

  test("filled arrays should have correct length", () => {
    expect([1]).toHaveLength(1);
    expect([7, 4, 2]).toHaveLength(3);
    expect(new Array<i32>(4)).toHaveLength(4);
    expect(new Array<i32>(5).fill(1)).toHaveLength(5);
  });
  
  test("filled arrays should have correct length when given as different integer types", () => {
    expect([1]).toHaveLength(u8(1));
    expect([7, 4, 2]).toHaveLength(u64(3));
    expect(new Array<i32>(4)).toHaveLength(i8(4));
  });
  
  test("filled arrays should have correct length when given as float types close to length", () => {
    expect(new Array<i32>(3)).toHaveLength(f64(0.6 / 0.2));
  });
});

describe("non-arrays", () => {
  test("should fail for primitives", () => {
    expect(7).not.toHaveLength(0);
    expect(7).not.toHaveLength(1);
    expect(u8(7)).not.toHaveLength(0);
    expect(u8(7)).not.toHaveLength(1);
    expect(u64(7)).not.toHaveLength(0);
    expect(u64(7)).not.toHaveLength(1);
    expect(f32(7)).not.toHaveLength(0);
    expect(f32(7)).not.toHaveLength(1);
    expect(f64(7)).not.toHaveLength(0);
    expect(f64(7)).not.toHaveLength(1);
    expect(true).not.toHaveLength(0);
    expect(true).not.toHaveLength(1);
  });
  
  test("should fail for bare null", () => {
    expect(null).not.toHaveLength(0);
    expect(null).not.toHaveLength(1);
  });

  test("should fail for object references and null object references", () => {
    let opts: TestOptions | null = TestOptions.only();
    expect(opts).not.toHaveLength(0);
    expect(opts).not.toHaveLength(1);
    
    opts = null;
    expect(opts).not.toHaveLength(0);
    expect(opts).not.toHaveLength(1);
  });
});

describe("strings", () => {
  test("should have length matching string length", () => {
    expect("").toHaveLength(0);
    expect("abc").toHaveLength(3);
    expect("A".repeat(512345)).toHaveLength(512345);
  });

  test("should fail for null string references", () => {
    const nullStr: string | null = null;
    expect(nullStr).not.toHaveLength(0);
    expect(nullStr).not.toHaveLength(1);
  });
});
