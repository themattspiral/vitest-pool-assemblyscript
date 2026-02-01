import { test, expect, describe } from "../../../assembly";

// Mixed float/integer toBe comparisons.
//
// AS rejects == when the float's mantissa can't losslessly represent the integer range:
//   f32 (24-bit mantissa): rejects i32, i64, u32, u64
//   f64 (53-bit mantissa): rejects i64, u64
//
// Our toBe matcher mirrors this behavior: allowed combinations compare via f64 promotion,
// rejected combinations throw an error describing the type incompatibility.

// --- Supported combinations: toBe compares via f64 promotion (matches AS == behavior) ---

describe("f32 vs signed integers (supported)", () => {
  test("f32 vs i8", () => {
    const a: f32 = 42.0;
    const b: i8 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });

  test("f32 vs i16", () => {
    const a: f32 = 42.0;
    const b: i16 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });
});

describe("f32 vs unsigned integers (supported)", () => {
  test("f32 vs u8", () => {
    const a: f32 = 42.0;
    const b: u8 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });

  test("f32 vs u16", () => {
    const a: f32 = 42.0;
    const b: u16 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });
});

describe("f64 vs signed integers (supported)", () => {
  test("f64 vs i8", () => {
    const a: f64 = 42.0;
    const b: i8 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });

  test("f64 vs i16", () => {
    const a: f64 = 42.0;
    const b: i16 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });

  test("f64 vs i32", () => {
    const a: f64 = 42.0;
    const b: i32 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });
});

describe("f64 vs unsigned integers (supported)", () => {
  test("f64 vs u8", () => {
    const a: f64 = 42.0;
    const b: u8 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });

  test("f64 vs u16", () => {
    const a: f64 = 42.0;
    const b: u16 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });

  test("f64 vs u32", () => {
    const a: f64 = 42.0;
    const b: u32 = 42;
    expect(a == b).toBeTruthy();
    expect(a).toBe(b);
    expect(b == a).toBeTruthy();
    expect(b).toBe(a);
  });
});

// --- Unsupported combinations: toBe throws (matches AS == rejection) ---
// AS rejects these because the float's mantissa cannot losslessly represent
// the integer type's full range (sizeof(int) >= sizeof(float)).

const PRECISION_ERROR_SUBSTRING = "float precision is insufficient";

describe("f32 vs 32-bit and 64-bit integers (unsupported)", () => {
  test("f32 vs i32 throws", () => {
    expect(() => { expect(<f32>42.0).toBe(<i32>42); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(<i32>42).toBe(<f32>42.0); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs i64 throws", () => {
    expect(() => { expect(<f32>42.0).toBe(<i64>42); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(<i64>42).toBe(<f32>42.0); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u32 throws", () => {
    expect(() => { expect(<f32>42.0).toBe(<u32>42); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(<u32>42).toBe(<f32>42.0); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u64 throws", () => {
    expect(() => { expect(<f32>42.0).toBe(<u64>42); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(<u64>42).toBe(<f32>42.0); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });
});

describe("f64 vs 64-bit integers (unsupported)", () => {
  test("f64 vs i64 throws", () => {
    expect(() => { expect(<f64>42.0).toBe(<i64>42); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(<i64>42).toBe(<f64>42.0); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f64 vs u64 throws", () => {
    expect(() => { expect(<f64>42.0).toBe(<u64>42); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(<u64>42).toBe(<f64>42.0); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });
});
