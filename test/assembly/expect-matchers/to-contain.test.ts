import { test, expect, describe, entry } from "vitest-pool-assemblyscript/assembly";

import { Point } from "../../assembly-src/user-class-utils";

describe("strings", () => {
  test("substrings", () => {
    const a = "hello 🌎 world!";
    expect(a).toContain("hello");
    expect(a).toContainEqual("hello");
    
    expect(a).toContain("🌎 world");
    expect(a).toContainEqual("🌎 world");

    expect(a).toContain("!");
    expect(a).toContainEqual("!");
    
    expect(a).toContain("🌎");
    expect(a).toContainEqual("🌎");
    
    expect(a).toContain("");
    expect(a).toContainEqual("");
    
    expect(a).not.toContain("helios");
    expect(a).not.toContainEqual("helios");
    
    expect(a).not.toContain("?");
    expect(a).not.toContainEqual("?");
  });
});

describe("arrays", () => {
  test("primitive number array", () => {
    const a: i32[] = [1, 2, 3];
    expect(a).toContain(2);
    expect(a).toContainEqual(2);
    expect(a).not.toContain(4);
    expect(a).not.toContainEqual(4);
  });
  
  test("string array", () => {
    const a: string[] = ["one", "two", "three", "fourtyfour"];
    expect(a).toContain("two");
    expect(a).toContainEqual("two");
    expect(a).toContain("fourtyfour");
    expect(a).toContainEqual("fourtyfour");
    expect(a).not.toContain("four");
    expect(a).not.toContainEqual("four");
  });
  
  test("object array - toContain uses identity comparison", () => {
    const b: Point = new Point(35, 7);
    const a: Point[] = [new Point(1, 2), b, new Point(2, 3)];
    expect(a).toContain(b);
    expect(a).not.toContain(new Point(35, 7));
  });
  
  test("object array - toContainEqual uses equality comparison", () => {
    const a: Point[] = [new Point(1, 2), new Point(2, 3)];
    expect(a).toContainEqual(new Point(1, 2));
    expect(a).not.toContainEqual(new Point(1, 7));
  });
  
  test("nullable object array contains null", () => {
    const a: Point | null = new Point(1, 2);
    const b: Point | null = new Point(3, 4);
    const c: Point | null = null;
    expect([a, b, c]).toContain(c);
    expect([a, b, c]).toContainEqual(c);
    expect([a, b, c]).toContain(null);
    expect([a, b, c]).toContainEqual(null);

    const arr: (Point | null)[] = [a, b, c];
    expect(arr).toContain(c);
    expect(arr).toContainEqual(c);
    expect(arr).toContain(null);
    expect(arr).toContainEqual(null);
    
    const arrBareNull: (Point | null)[] = [a, b, null];
    expect(arrBareNull).toContain(c);
    expect(arrBareNull).toContainEqual(c);
    expect(arrBareNull).toContain(null);
    expect(arrBareNull).toContainEqual(null);

    const arrNoNull: (Point | null)[] = [a, b];
    expect(arrNoNull).not.toContain(c);
    expect(arrNoNull).not.toContainEqual(c);
    expect(arrNoNull).not.toContain(null);
    expect(arrNoNull).not.toContainEqual(null);

    const arrNonNullable: Point[] = [a, b];
    expect(arrNonNullable).not.toContain(c);
    expect(arrNonNullable).not.toContainEqual(c);
    expect(arrNonNullable).not.toContain(null);
    expect(arrNonNullable).not.toContainEqual(null);
  });

  test("empty array contains nothing", () => {
    const a: i32[] = [];
    expect(a).not.toContain(5);
    expect(a).not.toContain(5.5);
    expect(a).not.toContain("anything");
    expect(a).not.toContain(null);
    expect(a).not.toContainEqual(5);
    expect(a).not.toContainEqual(5.5);
    expect(a).not.toContainEqual("anything");
    expect(a).not.toContainEqual(null);
  });

  test("array cross-type equality", () => {
    const a: i32[] = [1, 2, 3];
    expect(a).toContain(f64(2.0));
    expect(a).toContainEqual(f64(2.0));
    expect(a).toContain(u8(3));
    expect(a).toContainEqual(u8(3));
    expect(a).not.toContain(u64(7));
    expect(a).not.toContainEqual(u64(7));
  });
});

describe("sets", () => {
  test("primitive type", () => {
    const a = new Set<i32>();
    a.add(1);
    a.add(2);
    a.add(3);

    expect(a).toContain(2);
    expect(a).toContainEqual(2);

    expect(a).not.toContain(7);
    expect(a).not.toContainEqual(7);
  });
  
  test("string type", () => {
    const a = new Set<string>();
    a.add("one");
    a.add("two");
    a.add("three");

    expect(a).toContain("two");
    expect(a).toContainEqual("two");

    expect(a).not.toContain("seven");
    expect(a).not.toContainEqual("seven");
  });
  
  test("object type", () => {
    const a = new Set<Point>();
    const b = new Point(37, 7);
    a.add(new Point(1, 2));
    a.add(new Point(3, 4));
    a.add(b);

    expect(a).toContain(b);
    expect(a).toContainEqual(b);

    // toContainEqual difference
    expect(a).not.toContain(new Point(1, 2));
    expect(a).toContainEqual(new Point(1, 2));
  });

  test("set cross-type equality", () => {
    const a = new Set<i32>();
    a.add(1);
    a.add(2);
    a.add(3);

    // toContain(Set) supports exact same types only
    // because it uses Set.has, and other behavior would be misleading

    expect(a).toContainEqual(f64(2.0));
    expect(a).toContainEqual(u8(3));
    expect(a).not.toContainEqual(u64(7));
  });
});

describe("maps", () => {
  test("primitive value type", () => {
    const a = new Map<string, i32>();
    a.set("one", 1);
    a.set("two", 2);
    a.set("three", 3);

    expect(a).toContain(entry("two", 2));
    expect(a).toContainEqual(entry("two", 2));

    expect(a).not.toContain(entry("two", 5));
    expect(a).not.toContainEqual(entry("two", 5));
    expect(a).not.toContain(entry("four", 2));
    expect(a).not.toContainEqual(entry("four", 2));
    expect(a).not.toContain(entry("four", 4));
    expect(a).not.toContainEqual(entry("four", 4));
  });
  
  test("string value type", () => {
    const a = new Map<string, string>();
    a.set("one", "ONE!");
    a.set("two", "TWO!");
    a.set("three", "THREE!");

    expect(a).toContain(entry("two", "TWO!"));
    expect(a).toContainEqual(entry("two", "TWO!"));

    expect(a).not.toContain(entry("two", "FIVE!"));
    expect(a).not.toContainEqual(entry("two", "FIVE!"));
    expect(a).not.toContain(entry("four", "TWO!"));
    expect(a).not.toContainEqual(entry("four", "TWO!"));
    expect(a).not.toContain(entry("four", "FOUR!"));
    expect(a).not.toContainEqual(entry("four", "FOUR!"));
  });
  
  test("string key, object value type", () => {
    const a = new Map<string, Point>();
    const b = new Point(37, 7);
    a.set("one", new Point(1, 2));
    a.set("two", b);
    a.set("three", new Point(3, 4));

    expect(a).toContain(entry("two", b));
    expect(a).toContainEqual(entry("two", b));

    // toContainEqual difference for object value comparison
    expect(a).not.toContain(entry("three", new Point(3, 4)));
    expect(a).toContainEqual(entry("three", new Point(3, 4)));

    expect(a).not.toContainEqual(entry("two", new Point(8, 9)));
    expect(a).not.toContainEqual(entry("seven", new Point(3, 4)));
  });
  
  test("numeric key, object value type", () => {
    const a = new Map<i32, Point>();
    const b = new Point(37, 7);
    a.set(1, new Point(1, 2));
    a.set(2, b);
    a.set(3, new Point(3, 4));

    expect(a).toContain(entry(2, b));
    expect(a).not.toContain(entry(7, new Point(3, 4)));
    
    // toContainEqual difference for object value comparison
    expect(a).not.toContain(entry(3, new Point(3, 4)));
    expect(a).toContainEqual(entry(3, new Point(3, 4)));
    
    expect(a).not.toContainEqual(entry(2, new Point(8, 9)));
    expect(a).not.toContainEqual(entry(7, new Point(3, 4)));
  });
  
  test("object key", () => {
    const a = new Map<Point, i32>();
    const b = new Point(37, 7);
    a.set(new Point(1, 2), 1);
    a.set(b, 2);
    a.set(new Point(3, 4), 3);

    // The key half of an entry is always matched by the map's own lookup, the same way
    // map.has()/map.get() behave - reference identity for object keys. So `b` (a retained
    // reference that is actually a key in the map) is found:
    expect(a).toContain(entry(b, 2));
    expect(a).toContainEqual(entry(b, 2));
    expect(a).not.toContain(entry(b, 7));
    expect(a).not.toContainEqual(entry(b, 7));

    // ...but a fresh Point(3, 4) is NOT found, even though a deeply-equal key exists in the
    // map. This holds for toContainEqual too: deep equality applies to the entry's value, never
    // its key. We intentionally do not deep-match keys, because the user's own
    // map.get(new Point(3, 4)) would return null - asserting containment here would describe a
    // lookup their real code can't perform. For object keys, toContain and toContainEqual are
    // therefore equivalent (both require the same key reference).
    expect(a).not.toContain(entry(new Point(3, 4), 3));
    expect(a).not.toContainEqual(entry(new Point(3, 4), 3));
    expect(a).not.toContain(entry(new Point(3, 4), 7));
    expect(a).not.toContainEqual(entry(new Point(3, 4), 7));
    expect(a).not.toContain(entry(new Point(8, 9), 1));
    expect(a).not.toContainEqual(entry(new Point(8, 9), 1));
  });

  test("same key-value type map can expect toContain inline array instead of MapEntry", () => {
    const a = new Map<string, string>();
    a.set("one", "ONE!");
    a.set("two", "TWO!");
    a.set("three", "THREE!");

    expect(a).toContain(["two", "TWO!"]);
    expect(a).toContainEqual(["two", "TWO!"]);

    expect(a).not.toContain(["two", "FIVE!"]);
    expect(a).not.toContainEqual(["two", "FIVE!"]);
    expect(a).not.toContain(["four", "TWO!"]);
    expect(a).not.toContainEqual(["four", "TWO!"]);
    expect(a).not.toContain(["four", "FOUR!"]);
    expect(a).not.toContainEqual(["four", "FOUR!"]);
  });

  test("map cross-type equality", () => {
    const a = new Map<string, i32>();
    a.set("one", 1);
    a.set("two", 2);
    a.set("three", 3);

    expect(a).toContain(entry("two", f64(2.0)));
    expect(a).toContainEqual(entry("two", f64(2.0)));
    expect(a).toContain(entry("three", u8(3)));
    expect(a).toContainEqual(entry("three", u8(3)));
    expect(a).not.toContain(entry("three", u64(7)));
    expect(a).not.toContainEqual(entry("three", u64(7)));
  });
});
