import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";

import { Point } from "../../assembly-src/user-class-utils";
import {
  Registry, PointGroup
} from "../../assembly-src/user-class-container-utils";


// Container type safety: incompatible container element types, container-level type
// mismatches, and precision-loss element comparisons all throw errors.
// Arrays and Sets throw at the element level via equals()/identical().
// Maps throw via assertSameContainerGeneric (rtId check).
// Cross-container comparisons (e.g. Set vs Array) throw via rtId mismatch in equals().
const CONTAINER_TYPE_ERROR_SUBSTRING = "Cannot compare deep equality between";
const INCOMPARABLE_ELEMENT_ERROR_SUBSTRING = "reference and value types are not comparable";

// toEqual follows the same float/integer type restrictions as toBe.
// See to-be-mixed-numerical-types.as.test.ts for the full comparison matrix.
const PRECISION_ERROR_SUBSTRING = "float precision is insufficient";

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

  test("Map<string, Point> field: deeply equal entries", () => {
    const mapA = new Map<string, Point>();
    mapA.set("origin", new Point(0, 0));
    mapA.set("target", new Point(5, 10));

    const mapB = new Map<string, Point>();
    mapB.set("origin", new Point(0, 0));
    mapB.set("target", new Point(5, 10));

    expect(new Registry(mapA)).toEqual(new Registry(mapB));
  });

  test("Map<string, Point> field: different point value", () => {
    const mapA = new Map<string, Point>();
    mapA.set("origin", new Point(0, 0));

    const mapB = new Map<string, Point>();
    mapB.set("origin", new Point(1, 1));

    expect(new Registry(mapA)).not.toEqual(new Registry(mapB));
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

  test("sets with same user object references are equal", () => {
    const p1 = new Point(1, 2);
    const p2 = new Point(3, 4);
    const p3 = new Point(5, 6);

    const setA = new Set<Point>();
    setA.add(p1);
    setA.add(p2);
    setA.add(p3);

    const setB = new Set<Point>();
    setB.add(p1);
    setB.add(p2);
    setB.add(p3);

    expect(setA).toEqual(setB);
  });

  test("sets with deeply equal distinct instances are equal", () => {
    const setA = new Set<Point>();
    setA.add(new Point(1, 2));
    setA.add(new Point(3, 4));
    setA.add(new Point(5, 6));

    const setB = new Set<Point>();
    setB.add(new Point(1, 2));
    setB.add(new Point(3, 4));
    setB.add(new Point(5, 6));

    expect(setA).toEqual(setB);
  });

  test("sets with deeply equal distinct instances in different insertion order", () => {
    const setA = new Set<Point>();
    setA.add(new Point(1, 2));
    setA.add(new Point(3, 4));
    setA.add(new Point(5, 6));

    const setB = new Set<Point>();
    setB.add(new Point(5, 6));
    setB.add(new Point(1, 2));
    setB.add(new Point(3, 4));

    expect(setA).toEqual(setB);
  });

  test("sets where only one element differs", () => {
    const setA = new Set<Point>();
    setA.add(new Point(1, 2));
    setA.add(new Point(3, 4));
    setA.add(new Point(5, 6));

    const setB = new Set<Point>();
    setB.add(new Point(1, 2));
    setB.add(new Point(3, 4));
    setB.add(new Point(99, 99));

    expect(setA).not.toEqual(setB);
  });

  test("sets where all elements differ", () => {
    const setA = new Set<Point>();
    setA.add(new Point(1, 2));
    setA.add(new Point(3, 4));

    const setB = new Set<Point>();
    setB.add(new Point(5, 6));
    setB.add(new Point(7, 8));

    expect(setA).not.toEqual(setB);
  });

  test("Nested Set<Point> field: same references are equal", () => {
    const p1 = new Point(1, 2);
    const p2 = new Point(3, 4);

    const setA = new Set<Point>();
    setA.add(p1);
    setA.add(p2);

    const setB = new Set<Point>();
    setB.add(p1);
    setB.add(p2);

    expect(new PointGroup(setA)).toEqual(new PointGroup(setB));
  });

  test("Nested Set<Point> field: equal but distinct instances are equal", () => {
    const setA = new Set<Point>();
    setA.add(new Point(3, 4));
    setA.add(new Point(1, 2));

    const setB = new Set<Point>();
    setB.add(new Point(1, 2));
    setB.add(new Point(3, 4));
    
    expect(new PointGroup(setA)).toEqual(new PointGroup(setB));
  });
});

// Cross-type container equality: containers with compatible element types are compared
// element-by-element via equals()/identical(), allowing cross-type numeric comparisons.
describe("cross-type container equality", () => {
  test("Array<i32> vs Array<f64> with matching values are equal", () => {
    const a: i32[] = [1, 2, 3];
    const b: f64[] = [1.0, 2.0, 3.0];
    expect(a).toEqual(b);
  });

  test("StaticArray<i32> vs StaticArray<f64> with matching values are equal", () => {
    const a: StaticArray<i32> = StaticArray.fromArray<i32>([1, 2, 3]);
    const b: StaticArray<f64> = StaticArray.fromArray<f64>([1.0, 2.0, 3.0]);
    expect(a).toEqual(b);
  });

  test("Set<i32> vs Set<f64> with matching values are equal", () => {
    const setA = new Set<i32>();
    setA.add(1);
    setA.add(2);
    setA.add(3);

    const setB = new Set<f64>();
    setB.add(1.0);
    setB.add(2.0);
    setB.add(3.0);

    expect(setA).toEqual(setB);
  });
});

describe("container type safety", () => {
  test("Array<i32> vs Array<string> throws", () => {
    expect(() => {
      expect([1, 2, 3]).toEqual(["a", "b", "c"]);
    }).toThrowError(INCOMPARABLE_ELEMENT_ERROR_SUBSTRING);
  });

  test("Set<i32> vs Set<string> throws", () => {
    expect(() => {
      const setI32 = new Set<i32>();
      setI32.add(1);
      const setStr = new Set<string>();
      setStr.add("a");
      expect(setI32).toEqual(setStr);
    }).toThrowError(INCOMPARABLE_ELEMENT_ERROR_SUBSTRING);
  });

  test("Array<f32> vs Array<i32> throws (precision loss)", () => {
    expect(() => {
      const a: f32[] = [1.0, 2.0];
      const b: i32[] = [1, 2];
      expect(a).toEqual(b);
    }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("Set<f32> vs Set<i32> throws (precision loss)", () => {
    expect(() => {
      const setA = new Set<f32>();
      setA.add(1.0);
      const setB = new Set<i32>();
      setB.add(1);
      expect(setA).toEqual(setB);
    }).toThrowError(PRECISION_ERROR_SUBSTRING);
  });

  test("Map<string, i32> vs Map<string, string> throws", () => {
    expect(() => {
      const mapA = new Map<string, i32>();
      mapA.set("x", 1);
      const mapB = new Map<string, string>();
      mapB.set("x", "one");
      expect(mapA).toEqual(mapB);
    }).toThrowError(CONTAINER_TYPE_ERROR_SUBSTRING);
  });

  test("Map<string, i32> vs Map<i32, string> throws", () => {
    expect(() => {
      const mapA = new Map<string, i32>();
      mapA.set("x", 1);
      const mapB = new Map<i32, string>();
      mapB.set(1, "x");
      expect(mapA).toEqual(mapB);
    }).toThrowError(CONTAINER_TYPE_ERROR_SUBSTRING);
  });

  test("Set vs Array with same values throws", () => {
    expect(() => {
      const setA = new Set<string>();
      setA.add("apple");
      setA.add("cherry");

      const arrayA = ["apple", "cherry"];

      expect(setA).toEqual(arrayA);
    }).toThrowError(CONTAINER_TYPE_ERROR_SUBSTRING);
  });
});
