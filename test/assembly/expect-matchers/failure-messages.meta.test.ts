import { describe, expect, test, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { Circle, Point, Shape, Square, ShapeWrapper } from "../../assembly-src/user-class-utils";

// Meta fixture: intentional matcher failures to verify CLI error output formatting.
// Each test is expected to fail — the meta-verify tests assert on the resulting
// error type, message text, and diff content in the CLI output.

// =============================================================================
// ASSERTION FAILURES (AssertionError)
// =============================================================================

describe("toBe", () => {
  test("integer [should fail]", () => {
    expect(1).toBe(2);
  });

  test("string [should fail]", () => {
    expect("hello").toBe("world");
  });

  test("float [should fail]", () => {
    expect(1.5).toBe(2.5);
  });

  test("array [should fail]", () => {
    const a: i32[] = [1, 2, 3];
    const b: i32[] = [1, 2, 3];
    expect(a).toBe(b);
  });

  test("map [should fail]", () => {
    const a = new Map<string, i32>();
    a.set("x", 1);
    a.set("y", 2);
    const b = new Map<string, i32>();
    b.set("x", 1);
    b.set("y", 2);
    expect(a).toBe(b);
  });

  test("set [should fail]", () => {
    const a = new Set<i32>();
    a.add(1);
    a.add(2);
    a.add(3);
    const b = new Set<i32>();
    b.add(1);
    b.add(2);
    b.add(3);
    expect(a).toBe(b);
  });

  test("user-defined object [should fail]", () => {
    expect(new Point(1, 2)).toBe(new Point(1, 2));
  });

  test("ArrayBuffer [should fail]", () => {
    const a = new ArrayBuffer(8);
    const b = new ArrayBuffer(8);
    store<u8>(changetype<usize>(a), 0x01);
    expect(a).toBe(b);
  });

  test("SIMD vector [should fail]", () => {
    expect(i32x4(1, 2, 3, 4)).toBe(i32x4(1, 2, 3, 99));
  });
});

describe("toBeCloseTo", () => {
  test("float [should fail]", () => {
    expect(0.1 + 0.2).toBeCloseTo(0.5);
  });
});

describe("toEqual", () => {
  test("integer [should fail]", () => {
    expect(1).toEqual(2);
  });

  test("string [should fail]", () => {
    expect("hello").toEqual("world");
  });

  test("float [should fail]", () => {
    expect(1.5).toEqual(2.5);
  });

  test("number array [should fail]", () => {
    expect([1, 2, 3, 4]).toEqual([1, 2, 7, 4]);
  });

  test("string array [should fail]", () => {
    expect(["one", "two", "three"]).toEqual(["one", "two", "3"]);
  });

  test("map [should fail]", () => {
    const a = new Map<string, i32>();
    a.set("x", 1);
    a.set("y", 2);

    const b = new Map<string, i32>();
    b.set("x", 1);
    b.set("y", 99);

    expect(a).toEqual(b);
  });

  test("map with integer key [should fail]", () => {
    const a = new Map<i32, i32>();
    a.set(7, 100);
    a.set(8, 200);

    const b = new Map<i32, i32>();
    b.set(7, 100);
    b.set(8, 999);

    expect(a).toEqual(b);
  });

  test("set [should fail]", () => {
    const a = new Set<string>();
    a.add("apple");
    a.add("cherry");

    const b = new Set<string>();
    b.add("apple");
    b.add("banana");

    expect(a).toEqual(b);
  });

  test("ArrayBuffer same length [should fail]", () => {
    const a = new ArrayBuffer(4);
    const b = new ArrayBuffer(4);
    store<u8>(changetype<usize>(a), 0xFF);
    expect(a).toEqual(b);
  });

  test("ArrayBuffer different length [should fail]", () => {
    const a = new ArrayBuffer(4);
    const b = new ArrayBuffer(8);
    expect(a).toEqual(b);
  });

  test("SIMD vector [should fail]", () => {
    expect(i32x4(1, 2, 3, 4)).toEqual(i32x4(1, 2, 3, 99));
  });
});

describe("toStrictEqual", () => {
  test("array [should fail]", () => {
    expect([1, 2]).toStrictEqual([1, 3]);
  });
});

describe("toBeGreaterThan", () => {
  test("integer [should fail]", () => {
    expect(5).toBeGreaterThan(10);
  });
});

describe("toBeGreaterThanOrEqual", () => {
  test("integer [should fail]", () => {
    expect(5).toBeGreaterThanOrEqual(10);
  });
});

describe("toBeLessThan", () => {
  test("integer [should fail]", () => {
    expect(10).toBeLessThan(5);
  });
});

describe("toBeLessThanOrEqual", () => {
  test("integer [should fail]", () => {
    expect(10).toBeLessThanOrEqual(5);
  });
});

describe("toBeTruthy", () => {
  test("zero [should fail]", () => {
    expect(0).toBeTruthy();
  });
});

describe("toBeFalsy", () => {
  test("nonzero [should fail]", () => {
    expect(1).toBeFalsy();
  });
});

describe("toBeNull", () => {
  test("string [should fail]", () => {
    expect("hello").toBeNull();
  });
});

describe("toBeNullable", () => {
  test("string [should fail]", () => {
    expect("hello").toBeNullable();
  });
});

describe("toBeNaN", () => {
  test("integer [should fail]", () => {
    expect(77).toBeNaN();
  });
});

describe("toHaveLength", () => {
  test("array [should fail]", () => {
    expect([1, 2, 3]).toHaveLength(5);
  });

  test("string [should fail]", () => {
    expect("hello").toHaveLength(3);
  });
});

// =============================================================================
// RUNTIME ERRORS (WASMRuntimeError)
// These are thrown by the matcher comparison functions before reaching the
// assertion pass/fail path. They produce WASMRuntimeError, not AssertionError.
// Each AS abort kills the WASM instance, so each error path needs its own test.
// =============================================================================

// --- Float precision: toBe (via identical()) ---

describe("float precision - toBe", () => {
  test("f32 vs i32 [should fail]", () => {
    expect(f32(42.0)).toBe(i32(42));
  });

  test("i32 vs f32 [should fail]", () => {
    expect(i32(42)).toBe(f32(42.0));
  });
});

// --- Float precision: toEqual (via equals() → identical()) ---

describe("float precision - toEqual", () => {
  test("f32 vs i32 [should fail]", () => {
    expect(f32(42.0)).toEqual(i32(42));
  });

  test("i32 vs f32 [should fail]", () => {
    expect(i32(42)).toEqual(f32(42.0));
  });
});

// --- Float precision: inequality matchers (via compareInequality()) ---

describe("float precision - toBeGreaterThan", () => {
  test("f64 vs i64 [should fail]", () => {
    expect(f64(42.0)).toBeGreaterThan(i64(42));
  });

  test("i64 vs f64 [should fail]", () => {
    expect(i64(42)).toBeGreaterThan(f64(42.0));
  });
});

describe("float precision - toBeGreaterThanOrEqual", () => {
  test("f64 vs i64 [should fail]", () => {
    expect(f64(42.0)).toBeGreaterThanOrEqual(i64(42));
  });

  test("i64 vs f64 [should fail]", () => {
    expect(i64(42)).toBeGreaterThanOrEqual(f64(42.0));
  });
});

describe("float precision - toBeLessThan", () => {
  test("f64 vs i64 [should fail]", () => {
    expect(f64(42.0)).toBeLessThan(i64(42));
  });

  test("i64 vs f64 [should fail]", () => {
    expect(i64(42)).toBeLessThan(f64(42.0));
  });
});

describe("float precision - toBeLessThanOrEqual", () => {
  test("f64 vs i64 [should fail]", () => {
    expect(f64(42.0)).toBeLessThanOrEqual(i64(42));
  });

  test("i64 vs f64 [should fail]", () => {
    expect(i64(42)).toBeLessThanOrEqual(f64(42.0));
  });
});

// --- Incomparable types: all inequality matchers (via compareInequality() reference check) ---

describe("incomparable types", () => {
  test("toBeGreaterThan with arrays [should fail]", () => {
    expect([1, 2, 3]).toBeGreaterThan([4, 5, 6]);
  });

  test("toBeGreaterThanOrEqual with arrays [should fail]", () => {
    expect([1, 2, 3]).toBeGreaterThanOrEqual([4, 5, 6]);
  });

  test("toBeLessThan with arrays [should fail]", () => {
    expect([1, 2, 3]).toBeLessThan([4, 5, 6]);
  });

  test("toBeLessThanOrEqual with arrays [should fail]", () => {
    expect([1, 2, 3]).toBeLessThanOrEqual([4, 5, 6]);
  });
});

// --- Null string: all inequality matchers (via compareInequality() null guard) ---

describe("null string", () => {
  test("toBeGreaterThan [should fail]", () => {
    const a: string | null = null;
    expect(a).toBeGreaterThan("hello");
  });

  test("toBeGreaterThanOrEqual [should fail]", () => {
    const a: string | null = null;
    expect(a).toBeGreaterThanOrEqual("hello");
  });

  test("toBeLessThan [should fail]", () => {
    const a: string | null = null;
    expect(a).toBeLessThan("hello");
  });

  test("toBeLessThanOrEqual [should fail]", () => {
    const a: string | null = null;
    expect(a).toBeLessThanOrEqual("hello");
  });
});

// --- Cross-type comparison: toEqual only ---

describe("cross-type comparison", () => {
  test("toEqual map vs array [should fail]", () => {
    const m = new Map<string, i32>();
    m.set("a", 1);
    const a: string[] = ["a"];
    expect(m).toEqual(a);
  });

  test("toEqual user class type mismatch [should fail]", () => {
    expect(new Circle("red", 5.0)).toEqual(new Shape("red"));
  });

  test("toEqual nested type mismatch [should fail]", () => {
    const a = new ShapeWrapper("w1", new Circle("red", 5.0));
    const b = new ShapeWrapper("w1", new Square("red", 5.0));
    expect(a).toEqual(b);
  });
});

// --- Container type safety: throws with path context ---

describe("container type safety", () => {
  test("Array incomparable element types [should fail]", () => {
    expect([1, 2, 3]).toEqual(["a", "b", "c"]);
  });

  test("Set incomparable element types [should fail]", () => {
    const setI32 = new Set<i32>();
    setI32.add(1);
    const setStr = new Set<string>();
    setStr.add("a");
    expect(setI32).toEqual(setStr);
  });

  test("Map incomparable value types with string key [should fail]", () => {
    const mapA = new Map<string, i32>();
    mapA.set("x", 1);
    const mapB = new Map<string, string>();
    mapB.set("x", "one");
    expect(mapA).toEqual(mapB);
  });

  test("Map incomparable value types with integer key [should fail]", () => {
    const mapA = new Map<i32, string>();
    mapA.set(7, "hello");
    const mapB = new Map<i32, i32>();
    mapB.set(7, 42);
    expect(mapA).toEqual(mapB);
  });

  test("Array precision loss [should fail]", () => {
    const a: f32[] = [1.0, 2.0];
    const b: i32[] = [1, 2];
    expect(a).toEqual(b);
  });

  test("Set precision loss [should fail]", () => {
    const setA = new Set<f32>();
    setA.add(1.0);
    const setB = new Set<i32>();
    setB.add(1);
    expect(setA).toEqual(setB);
  });

  test("Map precision loss with string key [should fail]", () => {
    const mapA = new Map<string, f32>();
    mapA.set("x", 1.0);
    const mapB = new Map<string, i32>();
    mapB.set("x", 1);
    expect(mapA).toEqual(mapB);
  });

  test("Map mismatched key types [should fail]", () => {
    const mapA = new Map<string, i32>();
    mapA.set("x", 1);
    const mapB = new Map<i32, string>();
    mapB.set(1, "x");
    expect(mapA).toEqual(mapB);
  });

  test("Set vs Array cross-container [should fail]", () => {
    const setA = new Set<string>();
    setA.add("apple");
    setA.add("cherry");
    const arrayA = ["apple", "cherry"];
    expect(setA).toEqual(arrayA);
  });
});

describe("unsupported types", () => {
  test("toBeGreaterThan with v128 [should fail]", () => {
    const a: v128 = i32x4.splat(1);
    const b: v128 = i32x4.splat(2);
    expect(a).toBeGreaterThan(b);
  });

  test("toBeGreaterThanOrEqual with v128 [should fail]", () => {
    const a: v128 = i32x4.splat(1);
    const b: v128 = i32x4.splat(2);
    expect(a).toBeGreaterThanOrEqual(b);
  });

  test("toBeLessThan with v128 [should fail]", () => {
    const a: v128 = i32x4.splat(1);
    const b: v128 = i32x4.splat(2);
    expect(a).toBeLessThan(b);
  });

  test("toBeLessThanOrEqual with v128 [should fail]", () => {
    const a: v128 = i32x4.splat(1);
    const b: v128 = i32x4.splat(2);
    expect(a).toBeLessThanOrEqual(b);
  });

  test("toBeCloseTo with v128 [should fail]", () => {
    const a: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    const b: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    expect(a).toBeCloseTo(b);
  });

  test("toBeGreaterThan with v128 actual and i32 expected [should fail]", () => {
    const a: v128 = i32x4.splat(10);
    expect(a).toBeGreaterThan(i32(5));
  });

  test("toBeGreaterThan with i32 actual and v128 expected [should fail]", () => {
    const b: v128 = i32x4.splat(1);
    expect(i32(5)).toBeGreaterThan(b);
  });

  test("toBeCloseTo with v128 actual and f32 expected [should fail]", () => {
    const a: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    expect(a).toBeCloseTo(f32(1.0));
  });

  test("toBeCloseTo with f32 actual and v128 expected [should fail]", () => {
    const b: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    expect(f32(1.0)).toBeCloseTo(b);
  });
});

