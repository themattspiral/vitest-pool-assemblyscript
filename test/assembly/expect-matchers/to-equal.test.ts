import { test, expect, describe, TestOptions } from "vitest-pool-assemblyscript/assembly";
import {
  Point, PointF, Person, Line, NullableFields,
  Color, Token, Shape, Circle, Wallet, Pair, GameState,
} from "../../assembly-src/user-class-utils";

test("empty strings are equal", () => {
  expect("").toEqual("");
});

describe("primitives", () => {
  test("0-equivalent values should equal null", () => {
    // these will pass a loose toEqual(null), but not strict toBeNull()
    expect(false).toEqual(null);
    expect(0).toEqual(null);
    expect(f64(0.0)).toEqual(null);
    expect(u64(0.0)).toEqual(null);
    expect(u8(0.0)).toEqual(null);
    expect(null).toEqual(false);
    expect(null).toEqual(0);
    expect(null).toEqual(f64(0.0));
    expect(null).toEqual(u64(0.0));
    expect(null).toEqual(u8(0.0));
  });

  test("booleans should be equal to their correct numerical equivalents", () => {
    expect(true).toEqual(u8(1));
    expect(true).toEqual(f32(1.0));
    expect(true).toEqual(f64(1.0));
    expect(u8(1)).toEqual(true);
    expect(f32(1.0)).toEqual(true);
    expect(f64(1.0)).toEqual(true);
    
    expect(false).toEqual(u8(0));
    expect(false).toEqual(f32(0.0));
    expect(false).toEqual(f64(0.0));
    expect(u8(0)).toEqual(false);
    expect(f32(0.0)).toEqual(false);
    expect(f64(0.0)).toEqual(false);
  });
});

describe("edge cases", () => {
  test("global consts should be equal to themselves", () => {
    expect(Infinity).toEqual(Infinity);
  });

  test("Number extremes should be equal to themselves", () => {
    expect(F64.POSITIVE_INFINITY).toEqual(F64.POSITIVE_INFINITY);
    expect(F64.NEGATIVE_INFINITY).toEqual(F64.NEGATIVE_INFINITY);
    expect(F64.POSITIVE_INFINITY).not.toEqual(F64.NEGATIVE_INFINITY);
  });

  test("NaN should not be equal to itself", () => {
    // this may seem counterintuitive, but is IEEE 754 standard NaN behavior
    // use toBeNaN() instead!
    expect(NaN).not.toEqual(NaN);
    expect(F64.NaN).not.toEqual(F64.NaN);
    expect(F32.NaN).not.toEqual(F32.NaN);
    expect(NaN).not.toEqual(F64.NaN);
    expect(NaN).not.toEqual(F32.NaN);
    expect(F32.NaN).not.toEqual(F64.NaN);
  });
});

describe("strings", () => {
  test("empty strings are equal", () => {
    expect("").toEqual("");
  });
  
  test("same strings are equal", () => {
    expect("hello world!").toEqual("hello world!");
  });
  
  test("different strings are not equal", () => {
    expect("hello world!").not.toEqual("something else");
  });

  test("nullable strings are equal when null", () => {
    const a: string | null = null;
    const b: string | null = null;
    expect(a).toEqual(b);
  });
});

describe("arrays", () => {
  test("arrays with same values are equal", () => {
    const a: i32[] = [1, 2, 3, 4, 5];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).toEqual(b);
    expect(a).toStrictEqual(b);
  });
  
  test("arrays with different int types with same values are equal", () => {
    const a: u64[] = [1, 9, 37, 2];
    const b: i8[] = [1, 9, 37, 2];
    // NOTE: This behavior differs from JS expect.toBeCloseTo
    expect(a).toEqual(b);
  });
  
  test("arrays with different float types with same values (binary representable) are equal", () => {
    const a: f64[] = [22.5];
    const b: f32[] = [22.5];
    expect(a).toEqual(b);
  });
  
  test("arrays with different float types with same values (non binary representable) are not equal", () => {
    const a: f64[] = [22.12345];
    const b: f32[] = [22.12345];
    expect(a).not.toEqual(b);
  });
  
  test("arrays with same values in different order are not equal", () => {
    const a: i32[] = [2, 4, 5, 1, 3];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).not.toEqual(b);
  });
  
  test("arrays with different values are not equal", () => {
    const a: i32[] = [1, 5, 5, 9, 9];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).not.toEqual(b);
  });

  test("arrays with different lengths are not equal", () => {
    const a: u8[] = [1, 5, 5, 9, 9, 1];
    const b: u8[] = [1, 5, 5, 9, 9];
    expect(a).not.toEqual(b);
  });

  test("arrays of equal strings are equal", () => {
    const a: string[] = ["one", "two", "three"];
    const b: string[] = ["one", "two", "three"];
    expect(a).toEqual(b);
  });
  
  test("arrays of different strings are not equal", () => {
    const a: string[] = ["one", "two", "three"];
    const b: string[] = ["one", "two", "three", "four"];
    const c: string[] = ["one", "2", "three"];
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(c);
  });
});

describe("maps", () => {
  test("map equals itself", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);
    mapA.set("b", 2);

    expect(mapA).toEqual(mapA);
  });

  test("empty maps are equal", () => {
    const mapA = new Map<string, i32>();
    const mapB = new Map<string, i32>();
    expect(mapA).toEqual(mapB);
  });

  test("maps with same entries are equal", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);
    mapA.set("b", 2);

    const mapB = new Map<string, i32>();
    mapB.set("a", 1);
    mapB.set("b", 2);

    expect(mapA).toEqual(mapB);
  });

  test("maps with same entries in different insertion order are equal", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);
    mapA.set("b", 2);
    mapA.set("c", 3);

    const mapB = new Map<string, i32>();
    mapB.set("c", 3);
    mapB.set("a", 1);
    mapB.set("b", 2);

    expect(mapA).toEqual(mapB);
  });

  test("maps with same keys but different values are not equal", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);
    mapA.set("b", 2);

    const mapB = new Map<string, i32>();
    mapB.set("a", 1);
    mapB.set("b", 99);

    expect(mapA).not.toEqual(mapB);
  });

  test("maps with different sizes are not equal", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);

    const mapB = new Map<string, i32>();
    mapB.set("a", 1);
    mapB.set("b", 2);

    expect(mapA).not.toEqual(mapB);
  });

  test("same-size maps with different keys are not equal", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);
    mapA.set("b", 2);

    const mapB = new Map<string, i32>();
    mapB.set("a", 1);
    mapB.set("c", 2);

    expect(mapA).not.toEqual(mapB);
  });

  test("maps with array values use deep equality", () => {
    const mapA = new Map<string, i32[]>();
    mapA.set("nums", [1, 2, 3]);

    const mapB = new Map<string, i32[]>();
    mapB.set("nums", [1, 2, 3]);

    expect(mapA).toEqual(mapB);
  });

  test("maps with different array values are not equal", () => {
    const mapA = new Map<string, i32[]>();
    mapA.set("nums", [1, 2, 3]);

    const mapB = new Map<string, i32[]>();
    mapB.set("nums", [1, 2, 99]);

    expect(mapA).not.toEqual(mapB);
  });

  test("error is thrown when map compared to non-map type", () => {
    expect(() => {
      const mapA = new Map<string, i32>();
      mapA.set("a", 1);

      const arrayA: string[] = ["a"];

      expect(mapA).toEqual(arrayA);
    }).toThrowError("Cannot compare deep equality between");
  });
});

describe("sets", () => {
  test("set equals itself", () => {
    const setA = new Set<string>();
    setA.add("apple");
    setA.add("cherry");
    setA.add("banana");

    expect(setA).toEqual(setA);
  });

  test("empty sets are equal", () => {
    const setA = new Set<i32>();
    const setB = new Set<i32>();
    expect(setA).toEqual(setB);
  });

  test("sets with same values are equal", () => {
    const setA = new Set<string>();
    setA.add("apple");
    setA.add("cherry");

    const setB = new Set<string>();
    setB.add("cherry");
    setB.add("apple");

    expect(setA).toEqual(setB);
  });

  test("integer sets with same values are equal", () => {
    const setA = new Set<i32>();
    setA.add(1);
    setA.add(2);
    setA.add(3);

    const setB = new Set<i32>();
    setB.add(3);
    setB.add(1);
    setB.add(2);

    expect(setA).toEqual(setB);
  });

  test("sets with different sizes are not equal", () => {
    const setA = new Set<string>();
    setA.add("apple");
    setA.add("cherry");

    const setB = new Set<string>();
    setB.add("apple");
    setB.add("cherry");
    setB.add("banana");

    expect(setA).not.toEqual(setB);
  });

  test("same-size sets with different values are not equal", () => {
    const setA = new Set<string>();
    setA.add("apple");
    setA.add("cherry");

    const setB = new Set<string>();
    setB.add("apple");
    setB.add("banana");

    expect(setA).not.toEqual(setB);
  });

  test("error is thrown when set compared to array with same values", () => {
    expect(() => {
      const setA = new Set<string>();
      setA.add("apple");
      setA.add("cherry");

      const arrayA = ["apple", "cherry"];

      expect(setA).toEqual(arrayA);
    }).toThrowError("Cannot compare deep equality between");
  });
});

describe("SIMD vectors", () => {
  test("i32x4 with same values are equal", () => {
    const a: v128 = i32x4.splat(42);
    const b: v128 = i32x4.splat(42);
    expect(a).toEqual(b);
  });

  test("i32x4 with different values are not equal", () => {
    const a: v128 = i32x4.splat(1);
    const b: v128 = i32x4.splat(2);
    expect(a).not.toEqual(b);
  });

  test("f32x4 with same values are equal", () => {
    const a: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    const b: v128 = f32x4(1.0, 2.0, 3.0, 4.0);
    expect(a).toEqual(b);
  });

  test("f64x2 with same values are equal", () => {
    const a: v128 = f64x2(3.14, 2.72);
    const b: v128 = f64x2(3.14, 2.72);
    expect(a).toEqual(b);
  });

  test("different lane types with same bit pattern are equal", () => {
    const zeros_i32: v128 = i32x4.splat(0);
    const zeros_f32: v128 = f32x4(0.0, 0.0, 0.0, 0.0);
    const zeros_i64: v128 = i64x2(0, 0);
    const zeros_f64: v128 = f64x2(0.0, 0.0);
    expect(zeros_i32).toEqual(zeros_f32);
    expect(zeros_i32).toEqual(zeros_i64);
    expect(zeros_i32).toEqual(zeros_f64);
  });
});

describe("ArrayBuffer", () => {
  test("same reference is equal", () => {
    const buf = new ArrayBuffer(4);
    expect(buf).toEqual(buf);
  });

  test("empty buffers are equal", () => {
    const a = new ArrayBuffer(0);
    const b = new ArrayBuffer(0);
    expect(a).toEqual(b);
  });

  test("zero-filled buffers of same length are equal", () => {
    const a = new ArrayBuffer(16);
    const b = new ArrayBuffer(16);
    expect(a).toEqual(b);
  });

  test("buffers with same content are equal", () => {
    const a = new ArrayBuffer(10);
    const b = new ArrayBuffer(10);
    for (let i: usize = 0; i < 10; i++) {
      store<u8>(changetype<usize>(a) + i, u8(i + 1));
      store<u8>(changetype<usize>(b) + i, u8(i + 1));
    }
    expect(a).toEqual(b);
  });

  test("buffers with same byte content are equal regardless of how data was written", () => {
    const a = new ArrayBuffer(4);
    const b = new ArrayBuffer(4);
    // same byte values written in different representations
    store<u8>(changetype<usize>(a), 0xFF);
    store<u8>(changetype<usize>(b), 255);
    store<u8>(changetype<usize>(a) + 1, 0x2A);
    store<u8>(changetype<usize>(b) + 1, 42);
    store<u8>(changetype<usize>(a) + 2, 0x00);
    store<u8>(changetype<usize>(b) + 2, 0);
    store<u8>(changetype<usize>(a) + 3, 0x7F);
    store<u8>(changetype<usize>(b) + 3, 127);
    expect(a).toEqual(b);
  });

  test("buffers with different content are not equal", () => {
    const a = new ArrayBuffer(8);
    const b = new ArrayBuffer(8);
    store<u8>(changetype<usize>(a), 0xFF);
    store<u8>(changetype<usize>(b), 0x00);
    expect(a).not.toEqual(b);
  });

  test("buffers with different lengths are not equal", () => {
    const a = new ArrayBuffer(4);
    const b = new ArrayBuffer(8);
    expect(a).not.toEqual(b);
  });

  test("difference detected in remainder bytes", () => {
    // 9 bytes: 1 u64 word (bytes 0-7) + 1 remainder byte (byte 8)
    const a = new ArrayBuffer(9);
    const b = new ArrayBuffer(9);
    // first 8 bytes identical (both zero), difference in remainder byte
    store<u8>(changetype<usize>(a) + 8, 0xAA);
    store<u8>(changetype<usize>(b) + 8, 0xBB);
    expect(a).not.toEqual(b);
  });

  test("difference detected in word-aligned region", () => {
    // 16 bytes: 2 u64 words, difference in second word
    const a = new ArrayBuffer(16);
    const b = new ArrayBuffer(16);
    store<u8>(changetype<usize>(a) + 12, 0x01);
    expect(a).not.toEqual(b);
  });

  test("single byte buffers are compared correctly", () => {
    const a = new ArrayBuffer(1);
    const b = new ArrayBuffer(1);
    store<u8>(changetype<usize>(a), 42);
    store<u8>(changetype<usize>(b), 42);
    expect(a).toEqual(b);

    store<u8>(changetype<usize>(b), 99);
    expect(a).not.toEqual(b);
  });

  test("buffers smaller than word size are compared correctly", () => {
    // 7 bytes: entirely handled by remainder loop (no u64 words)
    const a = new ArrayBuffer(7);
    const b = new ArrayBuffer(7);
    for (let i: usize = 0; i < 7; i++) {
      store<u8>(changetype<usize>(a) + i, u8(i * 3));
      store<u8>(changetype<usize>(b) + i, u8(i * 3));
    }
    expect(a).toEqual(b);
  });

  test("exactly word-sized buffers are compared correctly", () => {
    // 8 bytes: exactly 1 u64 word, no remainder
    const a = new ArrayBuffer(8);
    const b = new ArrayBuffer(8);
    for (let i: usize = 0; i < 8; i++) {
      store<u8>(changetype<usize>(a) + i, u8(i + 10));
      store<u8>(changetype<usize>(b) + i, u8(i + 10));
    }
    expect(a).toEqual(b);
  });

  test("large buffers with complex data patterns are compared correctly", () => {
    // 259 bytes: 32 u64 words + 3 remainder bytes — exercises multiple word iterations
    const size: usize = 259;
    const a = new ArrayBuffer(size);
    const b = new ArrayBuffer(size);
    for (let i: usize = 0; i < size; i++) {
      // non-trivial byte pattern: mix of primes and bit ops to avoid repetition
      const val = u8((i * 7 + 13) ^ (i >> 2));
      store<u8>(changetype<usize>(a) + i, val);
      store<u8>(changetype<usize>(b) + i, val);
    }
    expect(a).toEqual(b);

    // flip a single byte near the end (in the remainder region) — should detect the difference
    store<u8>(changetype<usize>(b) + size - 2, 0xFF);
    expect(a).not.toEqual(b);
  });
});

describe("user defined objects", () => {
  describe("deep equality", () => {
    test("Point with same i32 fields", () => {
      expect(new Point(1, 2)).toEqual(new Point(1, 2));
    });

    test("Point with different fields", () => {
      expect(new Point(1, 2)).not.toEqual(new Point(3, 4));
      expect(new Point(1, 2)).not.toEqual(new Point(1, 99));
    });

    test("PointF with same f64 fields", () => {
      expect(new PointF(1.5, 2.7)).toEqual(new PointF(1.5, 2.7));
    });

    test("PointF with different fields", () => {
      expect(new PointF(1.5, 2.7)).not.toEqual(new PointF(1.5, 2.8));
    });

    test("Person with string and i32 fields", () => {
      expect(new Person("Alice", 30)).toEqual(new Person("Alice", 30));
    });

    test("Person with different fields", () => {
      expect(new Person("Alice", 30)).not.toEqual(new Person("Bob", 30));
      expect(new Person("Alice", 30)).not.toEqual(new Person("Alice", 31));
    });
  });

  describe("nested objects", () => {
    test("Line with deeply equal Points", () => {
      expect(new Line(new Point(0, 0), new Point(5, 10)))
        .toEqual(new Line(new Point(0, 0), new Point(5, 10)));
    });

    test("Line with different Points", () => {
      expect(new Line(new Point(0, 0), new Point(5, 10)))
        .not.toEqual(new Line(new Point(0, 0), new Point(5, 11)));
    });
  });

  describe("nullable fields", () => {
    test("both null", () => {
      expect(new NullableFields(null, 1)).toEqual(new NullableFields(null, 1));
    });

    test("both non-null and equal", () => {
      expect(new NullableFields("hello", 1)).toEqual(new NullableFields("hello", 1));
    });

    test("one null one non-null", () => {
      expect(new NullableFields(null, 1)).not.toEqual(new NullableFields("hello", 1));
      expect(new NullableFields("hello", 1)).not.toEqual(new NullableFields(null, 1));
    });

    test("different non-null values", () => {
      expect(new NullableFields("hello", 1)).not.toEqual(new NullableFields("world", 1));
    });
  });

  describe("@operator(\"==\") delegation", () => {
    test("same RGB different name are equal via @operator(\"==\")", () => {
      expect(new Color(255, 0, 0, "red")).toEqual(new Color(255, 0, 0, "crimson"));
    });

    test("different RGB are not equal", () => {
      expect(new Color(255, 0, 0, "red")).not.toEqual(new Color(0, 255, 0, "green"));
    });
  });

  describe(".equals() delegation", () => {
    test("same kind and value with different position are equal via .equals()", () => {
      expect(new Token(1, "if", 0)).toEqual(new Token(1, "if", 100));
    });

    test("different kind are not equal", () => {
      expect(new Token(1, "if", 0)).not.toEqual(new Token(2, "if", 0));
    });

    test("different value are not equal", () => {
      expect(new Token(1, "if", 0)).not.toEqual(new Token(1, "else", 0));
    });
  });

  describe("inheritance", () => {
    test("circles with same color and radius", () => {
      expect(new Circle("red", 5.0)).toEqual(new Circle("red", 5.0));
    });

    test("circles with different radius", () => {
      expect(new Circle("red", 5.0)).not.toEqual(new Circle("red", 10.0));
    });

    test("circles with different inherited color", () => {
      expect(new Circle("red", 5.0)).not.toEqual(new Circle("blue", 5.0));
    });

    test("base class: Shapes with same color", () => {
      expect(new Shape("red")).toEqual(new Shape("red"));
    });

    test("base class: Shapes with different color", () => {
      expect(new Shape("red")).not.toEqual(new Shape("blue"));
    });

    test("polymorphic: Shape-typed Circles with same fields", () => {
      const a: Shape = new Circle("red", 5.0);
      const b: Shape = new Circle("red", 5.0);
      expect(a).toEqual(b);
    });

    test("polymorphic: Shape-typed Circles with different radius", () => {
      const a: Shape = new Circle("red", 5.0);
      const b: Shape = new Circle("red", 10.0);
      expect(a).not.toEqual(b);
    });

    test("polymorphic: Shape-typed Circles with different inherited color", () => {
      const a: Shape = new Circle("red", 5.0);
      const b: Shape = new Circle("blue", 5.0);
      expect(a).not.toEqual(b);
    });

    test("polymorphic: Shape-typed Circle vs Shape-typed Shape are not equal", () => {
      const a: Shape = new Circle("red", 5.0);
      const b: Shape = new Shape("red");
      expect(a).not.toEqual(b);
    });

    test("cross-type: Circle vs Shape are not equal", () => {
      expect(new Circle("red", 5.0)).not.toEqual(new Shape("red"));
    });
  });

  describe("private fields", () => {
    test("same private balance", () => {
      expect(new Wallet("Alice", 100)).toEqual(new Wallet("Alice", 100));
    });

    test("different private balance", () => {
      expect(new Wallet("Alice", 100)).not.toEqual(new Wallet("Alice", 200));
    });

    test("different owner same balance", () => {
      expect(new Wallet("Alice", 100)).not.toEqual(new Wallet("Bob", 100));
    });

    test("getter exposes private field without affecting equality", () => {
      const wallet = new Wallet("Alice", 100);
      expect(wallet.balance).toBe(100);
    });
  });

  describe("generic classes", () => {
    test("Pair<i32> with same values", () => {
      expect(new Pair<i32>(1, 2)).toEqual(new Pair<i32>(1, 2));
    });

    test("Pair<i32> with different values", () => {
      expect(new Pair<i32>(1, 2)).not.toEqual(new Pair<i32>(1, 3));
    });

    test("Pair<string> with same values", () => {
      expect(new Pair<string>("a", "b")).toEqual(new Pair<string>("a", "b"));
    });

    test("Pair<string> with different values", () => {
      expect(new Pair<string>("a", "b")).not.toEqual(new Pair<string>("a", "c"));
    });

    test("Pair<Point> with nested user objects", () => {
      expect(new Pair<Point>(new Point(1, 2), new Point(3, 4)))
        .toEqual(new Pair<Point>(new Point(1, 2), new Point(3, 4)));
    });

    test("Pair<Point> with different nested objects", () => {
      expect(new Pair<Point>(new Point(1, 2), new Point(3, 4)))
        .not.toEqual(new Pair<Point>(new Point(1, 2), new Point(3, 5)));
    });
  });

  describe("composite object (all field types)", () => {
    test("identical composite objects are equal", () => {
      const invA = new Map<string, i32>();
      invA.set("sword", 1);
      invA.set("potion", 5);

      const invB = new Map<string, i32>();
      invB.set("sword", 1);
      invB.set("potion", 5);

      const tagsA = new Set<string>();
      tagsA.add("warrior");
      tagsA.add("guild-member");

      const tagsB = new Set<string>();
      tagsB.add("warrior");
      tagsB.add("guild-member");

      const bufA = new ArrayBuffer(4);
      store<u8>(changetype<usize>(bufA), 0xAB);
      store<u8>(changetype<usize>(bufA) + 1, 0xCD);

      const bufB = new ArrayBuffer(4);
      store<u8>(changetype<usize>(bufB), 0xAB);
      store<u8>(changetype<usize>(bufB) + 1, 0xCD);

      expect(new GameState(3, 1500.5, true, "Hero", new Point(10, 20), invA, tagsA, bufA))
        .toEqual(new GameState(3, 1500.5, true, "Hero", new Point(10, 20), invB, tagsB, bufB));
    });

    test("different i32 field", () => {
      const inv = new Map<string, i32>();
      const tags = new Set<string>();
      const buf = new ArrayBuffer(0);

      expect(new GameState(3, 0.0, false, "", new Point(0, 0), inv, tags, buf))
        .not.toEqual(new GameState(4, 0.0, false, "", new Point(0, 0), inv, tags, buf));
    });

    test("different f64 field", () => {
      const inv = new Map<string, i32>();
      const tags = new Set<string>();
      const buf = new ArrayBuffer(0);

      expect(new GameState(1, 100.0, false, "", new Point(0, 0), inv, tags, buf))
        .not.toEqual(new GameState(1, 200.0, false, "", new Point(0, 0), inv, tags, buf));
    });

    test("different bool field", () => {
      const inv = new Map<string, i32>();
      const tags = new Set<string>();
      const buf = new ArrayBuffer(0);

      expect(new GameState(1, 0.0, true, "", new Point(0, 0), inv, tags, buf))
        .not.toEqual(new GameState(1, 0.0, false, "", new Point(0, 0), inv, tags, buf));
    });

    test("different string field", () => {
      const inv = new Map<string, i32>();
      const tags = new Set<string>();
      const buf = new ArrayBuffer(0);

      expect(new GameState(1, 0.0, false, "Alice", new Point(0, 0), inv, tags, buf))
        .not.toEqual(new GameState(1, 0.0, false, "Bob", new Point(0, 0), inv, tags, buf));
    });

    test("different nested user object field", () => {
      const inv = new Map<string, i32>();
      const tags = new Set<string>();
      const buf = new ArrayBuffer(0);

      expect(new GameState(1, 0.0, false, "", new Point(1, 2), inv, tags, buf))
        .not.toEqual(new GameState(1, 0.0, false, "", new Point(3, 4), inv, tags, buf));
    });

    test("different Map field", () => {
      const invA = new Map<string, i32>();
      invA.set("sword", 1);

      const invB = new Map<string, i32>();
      invB.set("sword", 2);

      const tags = new Set<string>();
      const buf = new ArrayBuffer(0);

      expect(new GameState(1, 0.0, false, "", new Point(0, 0), invA, tags, buf))
        .not.toEqual(new GameState(1, 0.0, false, "", new Point(0, 0), invB, tags, buf));
    });

    test("different Set field", () => {
      const inv = new Map<string, i32>();

      const tagsA = new Set<string>();
      tagsA.add("warrior");

      const tagsB = new Set<string>();
      tagsB.add("mage");

      const buf = new ArrayBuffer(0);

      expect(new GameState(1, 0.0, false, "", new Point(0, 0), inv, tagsA, buf))
        .not.toEqual(new GameState(1, 0.0, false, "", new Point(0, 0), inv, tagsB, buf));
    });

    test("different ArrayBuffer field", () => {
      const inv = new Map<string, i32>();
      const tags = new Set<string>();

      const bufA = new ArrayBuffer(2);
      store<u8>(changetype<usize>(bufA), 0xFF);

      const bufB = new ArrayBuffer(2);
      store<u8>(changetype<usize>(bufB), 0x00);

      expect(new GameState(1, 0.0, false, "", new Point(0, 0), inv, tags, bufA))
        .not.toEqual(new GameState(1, 0.0, false, "", new Point(0, 0), inv, tags, bufB));
    });
  });
});

describe("nulls", () => {
  test("nulls are equal", () => {
    expect(null).toEqual(null);
  });
});

describe("nullables", () => {
  test("values of any nullable types are equal when null", () => {
    const a: string | null = null;
    const b: TestOptions | null = null;
    expect(a).toEqual(b);
  });
});

// toEqual follows the same float/integer type restrictions as toBe.
// See to-be-mixed-numerical-types.as.test.ts for the full comparison matrix.
const PRECISION_ERROR_SUBSTRING = "float precision is insufficient";

describe("unsupported float/integer comparisons", () => {
  test("f32 vs i32 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(i32(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i32(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs i64 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(i64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i64(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u32 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(u32(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u32(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f32 vs u64 throws", () => {
    expect(() => { expect(f32(42.0)).toEqual(u64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u64(42)).toEqual(f32(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f64 vs i64 throws", () => {
    expect(() => { expect(f64(42.0)).toEqual(i64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(i64(42)).toEqual(f64(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("f64 vs u64 throws", () => {
    expect(() => { expect(f64(42.0)).toEqual(u64(42)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
    expect(() => { expect(u64(42)).toEqual(f64(42.0)); }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });
});

// Precision loss edge cases — demonstrates WHY the above combinations are rejected.
// See to-be-mixed-numerical-types.as.test.ts for the full set of precision loss demos.
describe("precision loss false positives", () => {
  test("f64 cannot distinguish i64 values above 2^53", () => {
    const a: i64 = 9007199254740992;  // 2^53
    const b: i64 = 9007199254740993;  // 2^53 + 1

    expect(a == b).toBeFalsy();
    expect(f64(a)).toEqual(f64(b));
  });

  test("f32 cannot distinguish i32 values above 2^24", () => {
    const a: i32 = 16777216;  // 2^24
    const b: i32 = 16777217;  // 2^24 + 1

    expect(a == b).toBeFalsy();
    expect(f32(a)).toEqual(f32(b));
  });
});
