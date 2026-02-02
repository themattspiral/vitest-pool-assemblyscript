import { test, expect, describe } from "../../../assembly";

// Inequality matcher tests across the AS type matrix.
//
// Each test asserts AS language behavior first (raw >, <, >=, <=), then verifies
// the corresponding matcher produces the same result.
//
// AS rejects inequality operators for:
//   - Cross-sign integers (e.g. i32 > u32) — all combinations
//   - Float/integer where sizeof(int) >= sizeof(float) (e.g. f32 > i32, f64 > i64)
// Our matchers are MORE PERMISSIVE than AS for cross-sign integers (safe promotion),
// but mirror AS's rejection for float/integer precision-loss combinations.
// See docs/matcher-research.md for details.

// =============================================================================
// SAME-TYPE INTEGER COMPARISONS
// =============================================================================

describe("same-type integers", () => {
  test("i8", () => {
    const a: i8 = 10;
    const b: i8 = 20;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(a <= b).toBeTruthy();
    expect(a).toBeLessThanOrEqual(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
    expect(b >= a).toBeTruthy();
    expect(b).toBeGreaterThanOrEqual(a);
    expect(a > b).toBeFalsy();
    expect(a).not.toBeGreaterThan(b);
    expect(a >= b).toBeFalsy();
    expect(a).not.toBeGreaterThanOrEqual(b);

    // equal values
    const c: i8 = 10;
    expect(a <= c).toBeTruthy();
    expect(a).toBeLessThanOrEqual(c);
    expect(a >= c).toBeTruthy();
    expect(a).toBeGreaterThanOrEqual(c);
    expect(a < c).toBeFalsy();
    expect(a).not.toBeLessThan(c);
    expect(a > c).toBeFalsy();
    expect(a).not.toBeGreaterThan(c);
  });

  test("i16", () => {
    const a: i16 = -500;
    const b: i16 = 500;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("i32", () => {
    const a: i32 = -100_000;
    const b: i32 = 100_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("i64", () => {
    const a: i64 = -9_876_543_210;
    const b: i64 = 9_876_543_210;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u8", () => {
    const a: u8 = 10;
    const b: u8 = 200;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u16", () => {
    const a: u16 = 100;
    const b: u16 = 60_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u32", () => {
    const a: u32 = 100;
    const b: u32 = 3_000_000_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u64", () => {
    const a: u64 = 100;
    const b: u64 = 17_000_000_000_000_000_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });
});

// =============================================================================
// CROSS-SIZE INTEGER COMPARISONS
// =============================================================================

describe("cross-size signed integers", () => {
  test("i8 vs i16", () => {
    const a: i8 = -10;
    const b: i16 = 500;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("i8 vs i32", () => {
    const a: i8 = -10;
    const b: i32 = 100_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("i8 vs i64", () => {
    const a: i8 = -10;
    const b: i64 = 9_876_543_210;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("i16 vs i32", () => {
    const a: i16 = -500;
    const b: i32 = 100_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("i16 vs i64", () => {
    const a: i16 = -500;
    const b: i64 = 9_876_543_210;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("i32 vs i64", () => {
    const a: i32 = -100_000;
    const b: i64 = 9_876_543_210;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });
});

describe("cross-size unsigned integers", () => {
  test("u8 vs u16", () => {
    const a: u8 = 10;
    const b: u16 = 60_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u8 vs u32", () => {
    const a: u8 = 10;
    const b: u32 = 3_000_000_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u8 vs u64", () => {
    const a: u8 = 10;
    const b: u64 = 17_000_000_000_000_000_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u16 vs u32", () => {
    const a: u16 = 100;
    const b: u32 = 3_000_000_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u16 vs u64", () => {
    const a: u16 = 100;
    const b: u64 = 17_000_000_000_000_000_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("u32 vs u64", () => {
    const a: u32 = 100;
    const b: u64 = 17_000_000_000_000_000_000;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });
});

// =============================================================================
// CROSS-SIGN INTEGER COMPARISONS
// AS rejects ALL cross-sign inequality at compile time (unlike equality, where
// cross-sign == is allowed). Our matchers are more permissive — we handle these
// safely with signed-negative early return + u64 promotion.
// See docs/matcher-research.md for details.
//
// Language-level assertions are commented out because they don't compile:
// TS2365: Operator '<' cannot be applied to types 'i8' and 'u8'  (etc.)
// =============================================================================

describe("cross-sign integers (matcher-only, AS rejects language operators)", () => {
  test("i8 vs u8", () => {
    // expect(i8(-10) < u8(200)).toBeTruthy();  // TS2365: Operator '<' cannot be applied to types 'i8' and 'u8'
    expect(i8(-10)).toBeLessThan(u8(200));
    expect(u8(200)).toBeGreaterThan(i8(-10));
  });

  test("i8 vs u64", () => {
    // expect(i8(-10) < u64(100)).toBeTruthy();  // TS2365: Operator '<' cannot be applied to types 'i8' and 'u64'
    expect(i8(-10)).toBeLessThan(u64(100));
    expect(u64(100)).toBeGreaterThan(i8(-10));
  });

  test("i32 vs u32 (negative signed)", () => {
    // expect(i32(-100_000) < u32(3_000_000_000)).toBeTruthy();  // TS2365
    expect(i32(-100_000)).toBeLessThan(u32(3_000_000_000));
    expect(u32(3_000_000_000)).toBeGreaterThan(i32(-100_000));
  });

  test("i32 vs u32 (positive signed, different values)", () => {
    expect(i32(42)).toBeLessThan(u32(100));
    expect(u32(100)).toBeGreaterThan(i32(42));
    expect(i32(100)).toBeGreaterThan(u32(42));
    expect(u32(42)).toBeLessThan(i32(100));
  });

  test("i32 vs u32 (positive signed, equal values)", () => {
    expect(i32(42)).toBeLessThanOrEqual(u32(42));
    expect(i32(42)).toBeGreaterThanOrEqual(u32(42));
    expect(i32(42)).not.toBeLessThan(u32(42));
    expect(i32(42)).not.toBeGreaterThan(u32(42));
  });

  test("i64 vs u32", () => {
    expect(i64(-9_876_543_210)).toBeLessThan(u32(3_000_000_000));
    expect(u32(3_000_000_000)).toBeGreaterThan(i64(-9_876_543_210));
    // positive i64 vs u32
    expect(i64(5_000_000_000)).toBeGreaterThan(u32(3_000_000_000));
  });

  test("i64 vs u64 (negative signed)", () => {
    expect(i64(-9_876_543_210)).toBeLessThan(u64(17_000_000_000_000_000_000));
    expect(u64(17_000_000_000_000_000_000)).toBeGreaterThan(i64(-9_876_543_210));
  });

  test("i64 vs u64 (positive signed, equal values)", () => {
    expect(i64(42)).toBeLessThanOrEqual(u64(42));
    expect(i64(42)).toBeGreaterThanOrEqual(u64(42));
    expect(i64(42)).not.toBeLessThan(u64(42));
    expect(i64(42)).not.toBeGreaterThan(u64(42));
  });
});

// =============================================================================
// SAME-TYPE FLOAT COMPARISONS
// =============================================================================

describe("same-type floats", () => {
  test("f32", () => {
    const a: f32 = 1.5;
    const b: f32 = 2.5;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(a <= b).toBeTruthy();
    expect(a).toBeLessThanOrEqual(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
    expect(b >= a).toBeTruthy();
    expect(b).toBeGreaterThanOrEqual(a);
    expect(a > b).toBeFalsy();
    expect(a).not.toBeGreaterThan(b);

    // equal values
    const c: f32 = 1.5;
    expect(a <= c).toBeTruthy();
    expect(a).toBeLessThanOrEqual(c);
    expect(a >= c).toBeTruthy();
    expect(a).toBeGreaterThanOrEqual(c);
    expect(a < c).toBeFalsy();
    expect(a).not.toBeLessThan(c);
    expect(a > c).toBeFalsy();
    expect(a).not.toBeGreaterThan(c);
  });

  test("f64", () => {
    const a: f64 = -9_876_543_210.12345;
    const b: f64 = 9_876_543_210.12345;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });
});

// =============================================================================
// CROSS-TYPE FLOAT COMPARISONS (f32 vs f64)
// =============================================================================

describe("f32 vs f64", () => {
  test("different float types compare correctly", () => {
    const a: f32 = 1.5;
    const b: f64 = 2.5;
    expect(a < b).toBeTruthy();
    expect(a).toBeLessThan(b);
    expect(b > a).toBeTruthy();
    expect(b).toBeGreaterThan(a);
  });

  test("same value different float types", () => {
    const a: f32 = 45.5;
    const b: f64 = 45.5;
    // 45.5 is exactly representable in both f32 and f64
    expect(a <= b).toBeTruthy();
    expect(a).toBeLessThanOrEqual(b);
    expect(a >= b).toBeTruthy();
    expect(a).toBeGreaterThanOrEqual(b);
    expect(a < b).toBeFalsy();
    expect(a).not.toBeLessThan(b);
    expect(a > b).toBeFalsy();
    expect(a).not.toBeGreaterThan(b);
  });
});

// =============================================================================
// SUPPORTED FLOAT/INTEGER COMBOS
// These are the combinations where sizeof(integer) < sizeof(float),
// meaning the float has enough mantissa bits for the integer range.
// =============================================================================

describe("f32 vs small signed integers (supported)", () => {
  test("f32 vs i8", () => {
    const a: f32 = 42.0;
    const b: i8 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(a >= b).toBeTruthy();
    expect(a).toBeGreaterThanOrEqual(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
    expect(b <= a).toBeTruthy();
    expect(b).toBeLessThanOrEqual(a);
  });

  test("f32 vs i16", () => {
    const a: f32 = 42.0;
    const b: i16 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });
});

describe("f32 vs small unsigned integers (supported)", () => {
  test("f32 vs u8", () => {
    const a: f32 = 42.0;
    const b: u8 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });

  test("f32 vs u16", () => {
    const a: f32 = 42.0;
    const b: u16 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });
});

describe("f64 vs signed integers (supported)", () => {
  test("f64 vs i8", () => {
    const a: f64 = 42.0;
    const b: i8 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });

  test("f64 vs i16", () => {
    const a: f64 = 42.0;
    const b: i16 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });

  test("f64 vs i32", () => {
    const a: f64 = 42.0;
    const b: i32 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });
});

describe("f64 vs unsigned integers (supported)", () => {
  test("f64 vs u8", () => {
    const a: f64 = 42.0;
    const b: u8 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });

  test("f64 vs u16", () => {
    const a: f64 = 42.0;
    const b: u16 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });

  test("f64 vs u32", () => {
    const a: f64 = 42.0;
    const b: u32 = 10;
    expect(a > b).toBeTruthy();
    expect(a).toBeGreaterThan(b);
    expect(b < a).toBeTruthy();
    expect(b).toBeLessThan(a);
  });
});

// =============================================================================
// UNSUPPORTED FLOAT/INTEGER COMBOS (precision-loss rejection)
// These are the combinations where sizeof(integer) >= sizeof(float),
// meaning the float's mantissa cannot losslessly represent the integer range.
// AS rejects these at compile time — uncomment to verify compiler errors.
// Our matchers also reject these with a descriptive error.
// =============================================================================

// --- AS compiler errors (uncomment to verify) ---
// const _f32: f32 = 42.0; const _i32: i32 = 10;
// const _f32_gt_i32: bool = _f32 > _i32;   // TS2365: Operator '>' cannot be applied to types 'f32' and 'i32'
// const _i32_gt_f32: bool = _i32 > _f32;   // TS2365: Operator '>' cannot be applied to types 'i32' and 'f32'
// const _i64a: i64 = 10;
// const _f32_gt_i64: bool = _f32 > _i64a;  // TS2365: Operator '>' cannot be applied to types 'f32' and 'i64'
// const _i64_gt_f32: bool = _i64a > _f32;  // TS2365: Operator '>' cannot be applied to types 'i64' and 'f32'
// const _u32: u32 = 10;
// const _f32_gt_u32: bool = _f32 > _u32;   // TS2365: Operator '>' cannot be applied to types 'f32' and 'u32'
// const _u32_gt_f32: bool = _u32 > _f32;   // TS2365: Operator '>' cannot be applied to types 'u32' and 'f32'
// const _u64a: u64 = 10;
// const _f32_gt_u64: bool = _f32 > _u64a;  // TS2365: Operator '>' cannot be applied to types 'f32' and 'u64'
// const _u64_gt_f32: bool = _u64a > _f32;  // TS2365: Operator '>' cannot be applied to types 'u64' and 'f32'
// const _f64: f64 = 42.0; const _i64b: i64 = 10;
// const _f64_gt_i64: bool = _f64 > _i64b;  // TS2365: Operator '>' cannot be applied to types 'f64' and 'i64'
// const _i64_gt_f64: bool = _i64b > _f64;  // TS2365: Operator '>' cannot be applied to types 'i64' and 'f64'
// const _u64b: u64 = 10;
// const _f64_gt_u64: bool = _f64 > _u64b;  // TS2365: Operator '>' cannot be applied to types 'f64' and 'u64'
// const _u64_gt_f64: bool = _u64b > _f64;  // TS2365: Operator '>' cannot be applied to types 'u64' and 'f64'

const PRECISION_ERROR_SUBSTRING = "float precision is insufficient";

describe("unsupported float/integer comparisons throw", () => {
  test("f32 vs i32 throws", () => {
    expect(() => { expect(f32(42.0)).toBeGreaterThan(i32(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i32(42)).toBeGreaterThan(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs i64 throws", () => {
    expect(() => { expect(f32(42.0)).toBeGreaterThan(i64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i64(42)).toBeGreaterThan(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u32 throws", () => {
    expect(() => { expect(f32(42.0)).toBeLessThan(u32(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u32(42)).toBeLessThan(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u64 throws", () => {
    expect(() => { expect(f32(42.0)).toBeLessThanOrEqual(u64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u64(42)).toBeLessThanOrEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f64 vs i64 throws", () => {
    expect(() => { expect(f64(42.0)).toBeGreaterThanOrEqual(i64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i64(42)).toBeGreaterThanOrEqual(f64(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f64 vs u64 throws", () => {
    expect(() => { expect(f64(42.0)).toBeLessThan(u64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u64(42)).toBeLessThan(f64(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });
});

// =============================================================================
// BOOLEANS
// AS allows inequality on booleans (confirmed: no compile error).
// Booleans behave as numeric: true=1, false=0.
// =============================================================================

// Compile-time confirmation (no error)
const _bool_a: bool = true;
const _bool_b: bool = false;
const _bool_gt: bool = _bool_a > _bool_b;
const _bool_c: bool = true;
const _int_a: i32 = 0;
const _bool_gt_int: bool = _bool_c > _int_a;

describe("booleans", () => {
  test("bool vs bool inequality", () => {
    expect(true > false).toBeTruthy();
    expect(true).toBeGreaterThan(false);
    expect(false < true).toBeTruthy();
    expect(false).toBeLessThan(true);
    expect(true >= true).toBeTruthy();
    expect(true).toBeGreaterThanOrEqual(true);
    expect(false <= false).toBeTruthy();
    expect(false).toBeLessThanOrEqual(false);
    expect(true > true).toBeFalsy();
    expect(true).not.toBeGreaterThan(true);
    expect(false < false).toBeFalsy();
    expect(false).not.toBeLessThan(false);
    expect(false > true).toBeFalsy();
    expect(false).not.toBeGreaterThan(true);
  });

  test("bool vs integer inequality", () => {
    const t: bool = true;
    const f: bool = false;

    expect(t > i32(0)).toBeTruthy();
    expect(t).toBeGreaterThan(i32(0));
    expect(t >= i32(1)).toBeTruthy();
    expect(t).toBeGreaterThanOrEqual(i32(1));
    expect(t < i32(2)).toBeTruthy();
    expect(t).toBeLessThan(i32(2));
    expect(t > i32(1)).toBeFalsy();
    expect(t).not.toBeGreaterThan(i32(1));

    expect(f < i32(1)).toBeTruthy();
    expect(f).toBeLessThan(i32(1));
    expect(f >= i32(0)).toBeTruthy();
    expect(f).toBeGreaterThanOrEqual(i32(0));
    expect(f > i32(0)).toBeFalsy();
    expect(f).not.toBeGreaterThan(i32(0));

    // reverse direction
    expect(i32(2) > t).toBeTruthy();
    expect(i32(2)).toBeGreaterThan(t);
    expect(i32(0) < t).toBeTruthy();
    expect(i32(0)).toBeLessThan(t);
    expect(i32(1) >= t).toBeTruthy();
    expect(i32(1)).toBeGreaterThanOrEqual(t);
    expect(i32(1) > t).toBeFalsy();
    expect(i32(1)).not.toBeGreaterThan(t);
  });
});

// =============================================================================
// STRINGS
// AS allows inequality on strings (confirmed: no compile error).
// Comparison is lexicographic (Unicode code point order).
// =============================================================================

// Compile-time confirmation (no error)
const _str_a: string = "apple";
const _str_b: string = "banana";
const _str_gt: bool = _str_a > _str_b;

describe("strings", () => {
  test("lexicographic comparison basics", () => {
    expect("apple" < "banana").toBeTruthy();
    expect("apple").toBeLessThan("banana");
    expect("banana" > "apple").toBeTruthy();
    expect("banana").toBeGreaterThan("apple");
    expect("apple" >= "apple").toBeTruthy();
    expect("apple").toBeGreaterThanOrEqual("apple");
    expect("apple" <= "apple").toBeTruthy();
    expect("apple").toBeLessThanOrEqual("apple");
    expect("apple" > "apple").toBeFalsy();
    expect("apple").not.toBeGreaterThan("apple");
    expect("apple" < "apple").toBeFalsy();
    expect("apple").not.toBeLessThan("apple");
  });

  test("case sensitivity", () => {
    // uppercase letters have lower code points than lowercase in Unicode
    expect("A" < "a").toBeTruthy();
    expect("A").toBeLessThan("a");
    expect("Z" < "a").toBeTruthy();
    expect("Z").toBeLessThan("a");
    expect("a" > "A").toBeTruthy();
    expect("a").toBeGreaterThan("A");
  });

  test("prefix ordering", () => {
    // shorter prefix should come before longer string
    expect("app" < "apple").toBeTruthy();
    expect("app").toBeLessThan("apple");
    expect("apple" > "app").toBeTruthy();
    expect("apple").toBeGreaterThan("app");
  });

  test("empty string", () => {
    expect("" < "a").toBeTruthy();
    expect("").toBeLessThan("a");
    expect("a" > "").toBeTruthy();
    expect("a").toBeGreaterThan("");
    expect("" <= "").toBeTruthy();
    expect("").toBeLessThanOrEqual("");
    expect("" >= "").toBeTruthy();
    expect("").toBeGreaterThanOrEqual("");
    expect("" < "").toBeFalsy();
    expect("").not.toBeLessThan("");
    expect("" > "").toBeFalsy();
    expect("").not.toBeGreaterThan("");
  });

  test("numeric strings are lexicographic, not numeric", () => {
    // "9" > "10" because '9' > '1'
    expect("9" > "10").toBeTruthy();
    expect("9").toBeGreaterThan("10");
    expect("10" < "9").toBeTruthy();
    expect("10").toBeLessThan("9");
  });
});

// =============================================================================
// NON-COMPARABLE TYPES (should throw)
// =============================================================================

const INEQUALITY_NOT_SUPPORTED_SUBSTRING = "Inequality comparison is not supported";
const NULL_STRING_ERROR_SUBSTRING = "Cannot compare null string with inequality operators";

describe("non-comparable types throw", () => {
  test("arrays throw", () => {
    expect(() => {
      expect([1, 2, 3]).toBeGreaterThan([1, 2, 3]);
    }).toThrowError(INEQUALITY_NOT_SUPPORTED_SUBSTRING);
  });
});

describe("nulls", () => {
  test("bare null is usize(0) and compares as integer", () => {
    // null is usize(0), flows through integer path — consistent with toBe
    expect(null).toBeLessThanOrEqual(null);
    expect(null).toBeGreaterThanOrEqual(null);
    expect(null).not.toBeLessThan(null);
    expect(null).not.toBeGreaterThan(null);
  });

  test("nullable string throws when null (actual)", () => {
    const a: string | null = null;
    expect(() => {
      expect(a).toBeGreaterThan("hello");
    }).toThrowError(NULL_STRING_ERROR_SUBSTRING);
  });

  test("nullable string throws when null (compareTo)", () => {
    const b: string | null = null;
    expect(() => {
      expect("hello").toBeLessThan(b);
    }).toThrowError(NULL_STRING_ERROR_SUBSTRING);
  });

  test("nullable string throws when both null", () => {
    const a: string | null = null;
    const b: string | null = null;
    expect(() => {
      expect(a).toBeGreaterThanOrEqual(b);
    }).toThrowError(NULL_STRING_ERROR_SUBSTRING);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe("edge cases", () => {
  test("NaN comparisons are always false (IEEE 754)", () => {
    // NaN is not greater than, less than, or equal to anything, including itself
    expect(NaN > 0).toBeFalsy();
    expect(NaN).not.toBeGreaterThan(0);
    expect(NaN < 0).toBeFalsy();
    expect(NaN).not.toBeLessThan(0);
    expect(NaN >= 0).toBeFalsy();
    expect(NaN).not.toBeGreaterThanOrEqual(0);
    expect(NaN <= 0).toBeFalsy();
    expect(NaN).not.toBeLessThanOrEqual(0);
    expect(NaN > NaN).toBeFalsy();
    expect(NaN).not.toBeGreaterThan(NaN);
    expect(NaN < NaN).toBeFalsy();
    expect(NaN).not.toBeLessThan(NaN);
    expect(NaN >= NaN).toBeFalsy();
    expect(NaN).not.toBeGreaterThanOrEqual(NaN);
    expect(NaN <= NaN).toBeFalsy();
    expect(NaN).not.toBeLessThanOrEqual(NaN);
  });

  test("Infinity comparisons", () => {
    expect(Infinity > 0).toBeTruthy();
    expect(Infinity).toBeGreaterThan(0);
    expect(Infinity > F64.MAX_VALUE).toBeTruthy();
    expect(Infinity).toBeGreaterThan(F64.MAX_VALUE);
    expect(-Infinity < 0).toBeTruthy();
    expect(-Infinity).toBeLessThan(0);
    expect(-Infinity < F64.MIN_VALUE).toBeTruthy();
    expect(-Infinity).toBeLessThan(F64.MIN_VALUE);

    expect(Infinity > -Infinity).toBeTruthy();
    expect(Infinity).toBeGreaterThan(-Infinity);
    expect(-Infinity < Infinity).toBeTruthy();
    expect(-Infinity).toBeLessThan(Infinity);

    // Infinity equals itself
    expect(Infinity >= Infinity).toBeTruthy();
    expect(Infinity).toBeGreaterThanOrEqual(Infinity);
    expect(Infinity <= Infinity).toBeTruthy();
    expect(Infinity).toBeLessThanOrEqual(Infinity);
    expect(Infinity > Infinity).toBeFalsy();
    expect(Infinity).not.toBeGreaterThan(Infinity);
    expect(Infinity < Infinity).toBeFalsy();
    expect(Infinity).not.toBeLessThan(Infinity);
  });

  test("negative zero", () => {
    // IEEE 754: -0.0 == 0.0
    const negZero: f64 = -0.0;
    const posZero: f64 = 0.0;
    expect(negZero >= posZero).toBeTruthy();
    expect(negZero).toBeGreaterThanOrEqual(posZero);
    expect(negZero <= posZero).toBeTruthy();
    expect(negZero).toBeLessThanOrEqual(posZero);
    expect(negZero > posZero).toBeFalsy();
    expect(negZero).not.toBeGreaterThan(posZero);
    expect(negZero < posZero).toBeFalsy();
    expect(negZero).not.toBeLessThan(posZero);
  });
});

// =============================================================================
// PRECISION LOSS COUNTEREXAMPLE
// Demonstrates WHY unsupported float/integer inequality combos are rejected.
// =============================================================================

describe("precision loss counterexample (inequality)", () => {
  test("f64 promotion gives wrong >= result for i64 near 2^53", () => {
    const a: f64 = 9007199254740992.0;  // exactly 2^53
    const b: i64 = 9007199254740993;    // exactly 2^53 + 1

    // Mathematically: a (2^53) < b (2^53 + 1), so a >= b should be FALSE.
    // But f64(b) rounds down to 2^53, making them appear equal.
    // After f64 promotion: a >= f64(b) becomes 2^53 >= 2^53 = TRUE. (wrong!)
    expect(f64(a) >= f64(b)).toBeTruthy();

    // And a < b should be TRUE, but after promotion it's FALSE. (wrong!)
    expect(f64(a) < f64(b)).toBeFalsy();
  });

  test("f32 promotion gives wrong >= result for i32 near 2^24", () => {
    const a: f32 = 16777216.0;  // exactly 2^24
    const b: i32 = 16777217;    // exactly 2^24 + 1

    // Same problem at f32 scale: f32(b) rounds down to 2^24
    expect(f32(a) >= f32(b)).toBeTruthy();
    expect(f32(a) < f32(b)).toBeFalsy();
  });
});
