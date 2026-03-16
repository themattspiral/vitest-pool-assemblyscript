import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";

import { Point, Person, Shape, Circle, Square } from "../../assembly-src/user-class-utils";
import { Team } from "../../assembly-src/user-class-container-utils";

describe("arrays", () => {
  test("array equals itself", () => {
    const a: i32[] = [1, 2, 3];
    expect(a).toEqual(a);
  });

  test("empty arrays are equal", () => {
    const a: i32[] = [];
    const b: i32[] = [];
    expect(a).toEqual(b);
  });

  test("arrays with same values are equal", () => {
    const a: i32[] = [1, 2, 3, 4, 5];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).toEqual(b);
    expect(a).toStrictEqual(b);
  });

  test("arrays with different int types with same values are equal", () => {
    const a: u64[] = [1, 9, 37, 2];
    const b: i8[] = [1, 9, 37, 2];
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

  test("arrays with same Point references are equal", () => {
    const p1 = new Point(1, 2);
    const p2 = new Point(3, 4);
    const p3 = new Point(5, 6);

    const a: Array<Point> = [p1, p2, p3];
    const b: Array<Point> = [p1, p2, p3];
    expect(a).toEqual(b);
  });

  test("arrays with deeply equal distinct Point instances are equal", () => {
    const a: Array<Point> = [new Point(1, 2), new Point(3, 4), new Point(5, 6)];
    const b: Array<Point> = [new Point(1, 2), new Point(3, 4), new Point(5, 6)];
    expect(a).toEqual(b);
  });

  test("arrays where one Point element differs are not equal", () => {
    const a: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    const b: Array<Point> = [new Point(1, 2), new Point(99, 99)];
    expect(a).not.toEqual(b);
  });

  test("arrays where all Point elements differ are not equal", () => {
    const a: Array<Point> = [new Point(1, 2), new Point(3, 4)];
    const b: Array<Point> = [new Point(5, 6), new Point(7, 8)];
    expect(a).not.toEqual(b);
  });

  test("Array<Person> field: deeply equal members", () => {
    const teamA = new Team("alpha", [new Person("Alice", 30), new Person("Bob", 25)]);
    const teamB = new Team("alpha", [new Person("Alice", 30), new Person("Bob", 25)]);
    expect(teamA).toEqual(teamB);
  });

  test("Array<Person> field: different member", () => {
    const teamA = new Team("alpha", [new Person("Alice", 30)]);
    const teamB = new Team("alpha", [new Person("Bob", 25)]);
    expect(teamA).not.toEqual(teamB);
  });

  test("Array<Person> field: different length", () => {
    const teamA = new Team("alpha", [new Person("Alice", 30)]);
    const teamB = new Team("alpha", [new Person("Alice", 30), new Person("Bob", 25)]);
    expect(teamA).not.toEqual(teamB);
  });

  test("Array<Shape> with same runtime types are equal", () => {
    const a: Array<Shape> = [new Circle("red", 5.0), new Circle("blue", 3.0)];
    const b: Array<Shape> = [new Circle("red", 5.0), new Circle("blue", 3.0)];
    expect(a).toEqual(b);
  });

  test("Array<Shape> with Circle vs Square elements are not equal", () => {
    const a: Array<Shape> = [new Circle("red", 5.0)];
    const b: Array<Shape> = [new Square("red", 5.0)];
    expect(a).not.toEqual(b);
  });

  test("Array<Array<i32>> with deeply equal inner arrays are equal", () => {
    const a: Array<Array<i32>> = [[1, 2], [3, 4], [5, 6]];
    const b: Array<Array<i32>> = [[1, 2], [3, 4], [5, 6]];
    expect(a).toEqual(b);
  });

  test("Array<Array<i32>> where one inner array differs are not equal", () => {
    const a: Array<Array<i32>> = [[1, 2], [3, 4]];
    const b: Array<Array<i32>> = [[1, 2], [3, 99]];
    expect(a).not.toEqual(b);
  });
});

describe("StaticArray", () => {
  test("same values are equal", () => {
    const a: StaticArray<i32> = StaticArray.fromArray<i32>([1, 2, 3]);
    const b: StaticArray<i32> = StaticArray.fromArray<i32>([1, 2, 3]);
    expect(a).toEqual(b);
  });

  test("different values are not equal", () => {
    const a: StaticArray<i32> = StaticArray.fromArray<i32>([1, 2, 3]);
    const b: StaticArray<i32> = StaticArray.fromArray<i32>([1, 2, 99]);
    expect(a).not.toEqual(b);
  });

  test("different lengths are not equal", () => {
    const a: StaticArray<i32> = StaticArray.fromArray<i32>([1, 2, 3]);
    const b: StaticArray<i32> = StaticArray.fromArray<i32>([1, 2]);
    expect(a).not.toEqual(b);
  });

  test("empty static arrays are equal", () => {
    const a: StaticArray<i32> = StaticArray.fromArray<i32>([]);
    const b: StaticArray<i32> = StaticArray.fromArray<i32>([]);
    expect(a).toEqual(b);
  });

  test("string static arrays with same values are equal", () => {
    const a: StaticArray<string> = StaticArray.fromArray<string>(["one", "two"]);
    const b: StaticArray<string> = StaticArray.fromArray<string>(["one", "two"]);
    expect(a).toEqual(b);
  });
});

describe("TypedArrays", () => {
  test("Int32Array with same values are equal", () => {
    const a = new Int32Array(3);
    a[0] = 1; a[1] = 2; a[2] = 3;
    const b = new Int32Array(3);
    b[0] = 1; b[1] = 2; b[2] = 3;
    expect(a).toEqual(b);
  });

  test("Int32Array with different values are not equal", () => {
    const a = new Int32Array(3);
    a[0] = 1; a[1] = 2; a[2] = 3;
    const b = new Int32Array(3);
    b[0] = 1; b[1] = 2; b[2] = 99;
    expect(a).not.toEqual(b);
  });

  test("Float64Array with same values are equal", () => {
    const a = new Float64Array(2);
    a[0] = 3.14; a[1] = 2.72;
    const b = new Float64Array(2);
    b[0] = 3.14; b[1] = 2.72;
    expect(a).toEqual(b);
  });

  test("Uint8Array with same values are equal", () => {
    const a = new Uint8Array(4);
    a[0] = 0xFF; a[1] = 0x00; a[2] = 0xAB; a[3] = 0xCD;
    const b = new Uint8Array(4);
    b[0] = 0xFF; b[1] = 0x00; b[2] = 0xAB; b[3] = 0xCD;
    expect(a).toEqual(b);
  });

  test("TypedArrays with different lengths are not equal", () => {
    const a = new Int32Array(2);
    const b = new Int32Array(3);
    expect(a).not.toEqual(b);
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
