import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";

import { Point, Shape, Circle, Square } from "../../assembly-src/user-class-utils";
import {
  Registry, PointGroup
} from "../../assembly-src/user-class-container-utils.meta";


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

  test("maps with same Point references are equal", () => {
    const p1 = new Point(1, 2);
    const p2 = new Point(3, 4);

    const mapA = new Map<string, Point>();
    mapA.set("a", p1);
    mapA.set("b", p2);

    const mapB = new Map<string, Point>();
    mapB.set("a", p1);
    mapB.set("b", p2);

    expect(mapA).toEqual(mapB);
  });

  test("maps with deeply equal distinct Point values are equal", () => {
    const mapA = new Map<string, Point>();
    mapA.set("origin", new Point(0, 0));
    mapA.set("target", new Point(5, 10));
    mapA.set("mid", new Point(2, 5));

    const mapB = new Map<string, Point>();
    mapB.set("origin", new Point(0, 0));
    mapB.set("target", new Point(5, 10));
    mapB.set("mid", new Point(2, 5));

    expect(mapA).toEqual(mapB);
  });

  test("maps where one Point value differs are not equal", () => {
    const mapA = new Map<string, Point>();
    mapA.set("origin", new Point(0, 0));
    mapA.set("target", new Point(5, 10));

    const mapB = new Map<string, Point>();
    mapB.set("origin", new Point(0, 0));
    mapB.set("target", new Point(99, 99));

    expect(mapA).not.toEqual(mapB);
  });

  test("maps where all Point values differ are not equal", () => {
    const mapA = new Map<string, Point>();
    mapA.set("a", new Point(1, 2));
    mapA.set("b", new Point(3, 4));

    const mapB = new Map<string, Point>();
    mapB.set("a", new Point(5, 6));
    mapB.set("b", new Point(7, 8));

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

  test("Map<string, Shape> with same runtime type values are equal", () => {
    const mapA = new Map<string, Shape>();
    mapA.set("a", new Circle("red", 5.0));
    mapA.set("b", new Circle("blue", 3.0));

    const mapB = new Map<string, Shape>();
    mapB.set("a", new Circle("red", 5.0));
    mapB.set("b", new Circle("blue", 3.0));

    expect(mapA).toEqual(mapB);
  });

  test("Map<string, Shape> with Circle vs Square values are not equal", () => {
    const mapA = new Map<string, Shape>();
    mapA.set("a", new Circle("red", 5.0));

    const mapB = new Map<string, Shape>();
    mapB.set("a", new Square("red", 5.0));

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

  test("Map<string, Set<i32>> with deeply equal set values are equal", () => {
    const setA1 = new Set<i32>();
    setA1.add(1);
    setA1.add(2);
    const setA2 = new Set<i32>();
    setA2.add(3);
    setA2.add(4);

    const mapA = new Map<string, Set<i32>>();
    mapA.set("evens", setA1);
    mapA.set("odds", setA2);

    const setB1 = new Set<i32>();
    setB1.add(2);
    setB1.add(1);
    const setB2 = new Set<i32>();
    setB2.add(4);
    setB2.add(3);

    const mapB = new Map<string, Set<i32>>();
    mapB.set("evens", setB1);
    mapB.set("odds", setB2);

    expect(mapA).toEqual(mapB);
  });

  test("Map<string, Set<i32>> where one set value differs are not equal", () => {
    const setA = new Set<i32>();
    setA.add(1);
    setA.add(2);

    const mapA = new Map<string, Set<i32>>();
    mapA.set("nums", setA);

    const setB = new Set<i32>();
    setB.add(1);
    setB.add(99);

    const mapB = new Map<string, Set<i32>>();
    mapB.set("nums", setB);

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

  test("Set<Point> field: same references are equal", () => {
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

  test("Set<Point> field: equal but distinct instances are equal", () => {
    const setA = new Set<Point>();
    setA.add(new Point(3, 4));
    setA.add(new Point(1, 2));

    const setB = new Set<Point>();
    setB.add(new Point(1, 2));
    setB.add(new Point(3, 4));

    expect(new PointGroup(setA)).toEqual(new PointGroup(setB));
  });

  test("Set<Point> field: different instances are not equal", () => {
    const setA = new Set<Point>();
    setA.add(new Point(1, 2));

    const setB = new Set<Point>();
    setB.add(new Point(99, 99));

    expect(new PointGroup(setA)).not.toEqual(new PointGroup(setB));
  });

  test("Set<Shape> with same runtime type elements are equal", () => {
    const setA = new Set<Shape>();
    setA.add(new Circle("red", 5.0));
    setA.add(new Circle("blue", 3.0));

    const setB = new Set<Shape>();
    setB.add(new Circle("blue", 3.0));
    setB.add(new Circle("red", 5.0));

    expect(setA).toEqual(setB);
  });

  test("Set<Shape> with Circle vs Square elements are not equal", () => {
    const setA = new Set<Shape>();
    setA.add(new Circle("red", 5.0));

    const setB = new Set<Shape>();
    setB.add(new Square("red", 5.0));

    expect(setA).not.toEqual(setB);
  });

  test("Set<Array<i32>> with deeply equal inner arrays are equal", () => {
    const setA = new Set<Array<i32>>();
    setA.add([1, 2, 3]);
    setA.add([4, 5, 6]);

    const setB = new Set<Array<i32>>();
    setB.add([4, 5, 6]);
    setB.add([1, 2, 3]);

    expect(setA).toEqual(setB);
  });

  test("Set<Array<i32>> where one inner array differs are not equal", () => {
    const setA = new Set<Array<i32>>();
    setA.add([1, 2, 3]);
    setA.add([4, 5, 6]);

    const setB = new Set<Array<i32>>();
    setB.add([1, 2, 3]);
    setB.add([4, 5, 99]);

    expect(setA).not.toEqual(setB);
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

  test("Array<i32> vs Array<f64> with different values are not equal", () => {
    const a: i32[] = [1, 2, 3];
    const b: f64[] = [1.0, 2.0, 99.0];
    expect(a).not.toEqual(b);
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

  test("Set<i32> vs Set<f64> with different values are not equal", () => {
    const setA = new Set<i32>();
    setA.add(1);
    setA.add(2);

    const setB = new Set<f64>();
    setB.add(1.0);
    setB.add(99.0);

    expect(setA).not.toEqual(setB);
  });

  test("Map<string, i32> vs Map<string, f64> with matching values are equal", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);
    mapA.set("b", 2);
    mapA.set("c", 3);

    const mapB = new Map<string, f64>();
    mapB.set("a", 1.0);
    mapB.set("b", 2.0);
    mapB.set("c", 3.0);

    expect(mapA).toEqual(mapB);
  });

  test("Map<string, i32> vs Map<string, f64> with different values are not equal", () => {
    const mapA = new Map<string, i32>();
    mapA.set("a", 1);

    const mapB = new Map<string, f64>();
    mapB.set("a", 99.0);

    expect(mapA).not.toEqual(mapB);
  });
});
