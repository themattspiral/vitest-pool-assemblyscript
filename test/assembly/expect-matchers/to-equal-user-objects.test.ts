import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import {
  Point, PointF, Person, Line, NullableFields,
  Color, Token, Shape, Circle, Wallet, Pair, GameState,
  Empty, StaticOnly, GetterOnly, Config, Tag, SealedPoint, RawVec2,
  Sphere, Square, Animal, Dog, Cat,
  DualEquality, ThrowingEquals,
  ShapeWrapper, ListNode, TreeNode,
  NS_A, NS_B,
} from "../../assembly-src/user-class-utils";
import { defaultGameState } from './user-object-helpers';

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

  describe("class structure variations", () => {
    test("empty class (no fields): same type instances are equal", () => {
      expect(new Empty()).toEqual(new Empty());
    });

    test("static-only class: no instance fields, same type instances are equal", () => {
      expect(new StaticOnly()).toEqual(new StaticOnly());
    });

    test("getter-only class: getters excluded, same type instances are equal", () => {
      const g = new GetterOnly();
      expect(g).toEqual(new GetterOnly());
      // Exercise getters directly for coverage — deep equality excludes them by design
      expect(g.value).toBe(42);
      expect(g.label).toBe("computed");
    });

    test("readonly fields are compared normally", () => {
      expect(new Config("localhost", 8080)).toEqual(new Config("localhost", 8080));
      expect(new Config("localhost", 8080)).not.toEqual(new Config("localhost", 3000));
      expect(new Config("localhost", 8080)).not.toEqual(new Config("remote", 8080));
    });

    test("class with no explicit constructor uses default field values", () => {
      expect(new Tag()).toEqual(new Tag());
    });

    test("@sealed class: injection and comparison work normally", () => {
      expect(new SealedPoint(1, 2)).toEqual(new SealedPoint(1, 2));
      expect(new SealedPoint(1, 2)).not.toEqual(new SealedPoint(3, 4));
    });

    test("@unmanaged class: field comparison works", () => {
      const a: RawVec2 = { x: 1.0, y: 2.0 };
      const b: RawVec2 = { x: 1.0, y: 2.0 };
      expect(a).toEqual(b);

      const c: RawVec2 = { x: 1.0, y: 3.0 };
      expect(a).not.toEqual(c);
    });

    // Class expressions: AS parses `const MyClass = class { value: i32; }` but the
    // anonymous class has no name, so the deep equality transform generates
    // `changetype<>(__other)` with an empty type parameter, causing a parse error.
    // This is a transform limitation for anonymous classes — tracked for potential fix.
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

    test("@operator(\"==\") takes precedence when .equals() is also defined", () => {
      // DualEquality has operator== comparing id only, and .equals() comparing label only.
      // operator== should win: same id, different label → equal
      expect(new DualEquality(1, "foo")).toEqual(new DualEquality(1, "bar"));
      // different id, same label → not equal (operator== says no, even though .equals() would say yes)
      expect(new DualEquality(1, "foo")).not.toEqual(new DualEquality(2, "foo"));
      // Exercise .equals() directly for coverage — deep equality uses operator== instead
      const a = new DualEquality(1, "foo");
      const b = new DualEquality(2, "foo");
      expect(a.equals(b)).toBe(true);   // same label → .equals() returns true
      expect(a.equals(new DualEquality(1, "bar"))).toBe(false); // different label → false
    });

    test("@operator(\"==\") that throws propagates the error", () => {
      // ThrowingEquals throws when either value is negative
      expect(() => {
        expect(new ThrowingEquals(-1)).toEqual(new ThrowingEquals(1));
      }).toThrowError("Cannot compare negative values");
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

    test("multi-level: Spheres with same fields across 3 levels", () => {
      expect(new Sphere("red", 5.0, true)).toEqual(new Sphere("red", 5.0, true));
    });

    test("multi-level: Spheres with different own field", () => {
      expect(new Sphere("red", 5.0, true)).not.toEqual(new Sphere("red", 5.0, false));
    });

    test("multi-level: Spheres with different middle-level field", () => {
      expect(new Sphere("red", 5.0, true)).not.toEqual(new Sphere("red", 10.0, true));
    });

    test("multi-level: Spheres with different base-level field", () => {
      expect(new Sphere("red", 5.0, true)).not.toEqual(new Sphere("blue", 5.0, true));
    });

    test("sibling subclasses as base type are not equal", () => {
      const a: Shape = new Circle("red", 5.0);
      const b: Shape = new Square("red", 5.0);
      expect(a).not.toEqual(b);
    });

    test("abstract base: concrete subclasses with same inherited fields", () => {
      expect(new Dog("Rex", "labrador")).toEqual(new Dog("Rex", "labrador"));
    });

    test("abstract base: concrete subclasses with different own field", () => {
      expect(new Dog("Rex", "labrador")).not.toEqual(new Dog("Rex", "poodle"));
    });

    test("abstract base: concrete subclasses with different inherited field", () => {
      expect(new Dog("Rex", "labrador")).not.toEqual(new Dog("Spot", "labrador"));
    });

    test("abstract base: different concrete subclasses as base type are not equal", () => {
      const a: Animal = new Dog("Rex", "labrador");
      const b: Animal = new Cat("Whiskers", true);
      expect(a).not.toEqual(b);
    });

    test("abstract base: same concrete subclass as base type", () => {
      const a: Animal = new Dog("Rex", "labrador");
      const b: Animal = new Dog("Rex", "labrador");
      expect(a).toEqual(b);
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

    test("Pair with nullable type parameter: both null", () => {
      expect(new Pair<Point | null>(null, null))
        .toEqual(new Pair<Point | null>(null, null));
    });

    test("Pair with nullable type parameter: one null one non-null", () => {
      expect(new Pair<Point | null>(new Point(1, 2), null))
        .not.toEqual(new Pair<Point | null>(null, null));
    });

    test("Pair with nullable type parameter: both non-null and equal", () => {
      expect(new Pair<Point | null>(new Point(1, 2), new Point(3, 4)))
        .toEqual(new Pair<Point | null>(new Point(1, 2), new Point(3, 4)));
    });

    test("Pair with nullable type parameter: both non-null and different", () => {
      expect(new Pair<Point | null>(new Point(1, 2), null))
        .not.toEqual(new Pair<Point | null>(new Point(1, 99), null));
    });

    test("nested generics: Pair<Pair<i32>>", () => {
      expect(new Pair<Pair<i32>>(new Pair<i32>(1, 2), new Pair<i32>(3, 4)))
        .toEqual(new Pair<Pair<i32>>(new Pair<i32>(1, 2), new Pair<i32>(3, 4)));
    });

    test("nested generics: Pair<Pair<i32>> with different inner values", () => {
      expect(new Pair<Pair<i32>>(new Pair<i32>(1, 2), new Pair<i32>(3, 4)))
        .not.toEqual(new Pair<Pair<i32>>(new Pair<i32>(1, 2), new Pair<i32>(3, 5)));
    });
  });

  describe("composite object (all field types)", () => {
    test("identical composite objects are equal", () => {
      expect(defaultGameState()).toEqual(defaultGameState());
    });

    test("different i32 field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.level = 99;
      expect(a).not.toEqual(b);
    });

    test("different f64 field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.score = 9999.9;
      expect(a).not.toEqual(b);
    });

    test("different bool field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.active = false;
      expect(a).not.toEqual(b);
    });

    test("different string field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.playerName = "Villain";
      expect(a).not.toEqual(b);
    });

    test("different user object field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.position = new Point(99, 99);
      expect(a).not.toEqual(b);
    });

    test("different nullable field (non-null vs different non-null)", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.target = new Point(77, 77);
      expect(a).not.toEqual(b);
    });

    test("different nullable field (non-null vs null)", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.target = null;
      expect(a).not.toEqual(b);
    });

    test("different Map<string, i32> field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      const inv = new Map<string, i32>();
      inv.set("sword", 99);
      b.inventory = inv;
      expect(a).not.toEqual(b);
    });

    test("different Set<string> field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      const tags = new Set<string>();
      tags.add("mage");
      b.tags = tags;
      expect(a).not.toEqual(b);
    });

    test("different Array<i32> field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.scores = [10, 20, 99];
      expect(a).not.toEqual(b);
    });

    test("different StaticArray<f64> field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.fixedRatios = StaticArray.fromArray<f64>([1.5, 9.9]);
      expect(a).not.toEqual(b);
    });

    test("different Int32Array field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      const raw = new Int32Array(3);
      raw[0] = 100; raw[1] = 200; raw[2] = 999;
      b.rawScores = raw;
      expect(a).not.toEqual(b);
    });

    test("different Array<Point> field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.waypoints = [new Point(1, 2), new Point(99, 99)];
      expect(a).not.toEqual(b);
    });

    test("different Map<string, Point> field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      const lm = new Map<string, Point>();
      lm.set("spawn", new Point(0, 0));
      lm.set("boss", new Point(1, 1));
      b.landmarks = lm;
      expect(a).not.toEqual(b);
    });

    test("different Set<Point> field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      const v = new Set<Point>();
      v.add(new Point(8, 8));
      v.add(new Point(9, 9));
      b.visited = v;
      expect(a).not.toEqual(b);
    });

    test("different v128 field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      b.direction = i32x4(9, 9, 9, 9);
      expect(a).not.toEqual(b);
    });

    test("different ArrayBuffer field", () => {
      const a = defaultGameState();
      const b = defaultGameState();
      const buf = new ArrayBuffer(4);
      store<u8>(changetype<usize>(buf), 0xFF);
      b.rawData = buf;
      expect(a).not.toEqual(b);
    });
  });

  describe("nested type mismatch propagation", () => {
    test("polymorphic field with same runtime types", () => {
      const a = new ShapeWrapper("w1", new Circle("red", 5.0));
      const b = new ShapeWrapper("w1", new Circle("red", 5.0));
      expect(a).toEqual(b);
    });

    test("polymorphic field with different runtime types: not equal", () => {
      const a = new ShapeWrapper("w1", new Circle("red", 5.0));
      const b = new ShapeWrapper("w1", new Square("red", 5.0));
      expect(a).not.toEqual(b);
    });

    test("polymorphic field with different values of same runtime type: not equal", () => {
      const a = new ShapeWrapper("w1", new Circle("red", 5.0));
      const b = new ShapeWrapper("w1", new Circle("red", 10.0));
      expect(a).not.toEqual(b);
    });
  });

  describe("circular references", () => {
    test("self-referential with same values are equal", () => {
      const a = new ListNode(1);
      a.next = a;

      const b = new ListNode(1);
      b.next = b;

      expect(a).toEqual(b);
    });

    test("self-referential with different values are not equal", () => {
      const a = new ListNode(1);
      a.next = a;

      const b = new ListNode(99);
      b.next = b;

      expect(a).not.toEqual(b);
    });

    test("mutual circular reference with same values are equal", () => {
      const a1 = new ListNode(1);
      const a2 = new ListNode(2);
      a1.next = a2;
      a2.next = a1;

      const b1 = new ListNode(1);
      const b2 = new ListNode(2);
      b1.next = b2;
      b2.next = b1;

      expect(a1).toEqual(b1);
    });

    test("mutual circular reference with different values are not equal", () => {
      const a1 = new ListNode(1);
      const a2 = new ListNode(2);
      a1.next = a2;
      a2.next = a1;

      const b1 = new ListNode(1);
      const b2 = new ListNode(99);
      b1.next = b2;
      b2.next = b1;

      expect(a1).not.toEqual(b1);
    });

    test("container-mediated cycle with same values are equal", () => {
      const a = new TreeNode(1);
      a.children.push(a);

      const b = new TreeNode(1);
      b.children.push(b);

      expect(a).toEqual(b);
    });

    test("container-mediated cycle with different values are not equal", () => {
      const a = new TreeNode(1);
      a.children.push(a);

      const b = new TreeNode(99);
      b.children.push(b);

      expect(a).not.toEqual(b);
    });
  });

  describe("namespaced classes", () => {
    test("same namespace, same values are equal", () => {
      expect(new NS_A.Item(42)).toEqual(new NS_A.Item(42));
    });

    test("same namespace, different values are not equal", () => {
      expect(new NS_A.Item(42)).not.toEqual(new NS_A.Item(99));
    });

    test("different namespaces with same field values are not equal", () => {
      // NS_A.Item and NS_B.Item are distinct types despite identical structure.
      // Runtime type IDs (rtId) distinguish them even though nameof returns "Item" for both.
      const a = new NS_A.Item(42);
      const b = new NS_B.Item(42);
      expect(a).not.toEqual(b);

      // expect(() => {
      //   const a = new NS_A.Item(42);
      //   const b = new NS_B.Item(42);
      //   expect(a).toEqual(b);
      // }).toThrowError("runtime type mismatch");
    });
  });

  describe("nullable user object types", () => {
    test("both null: nullable user objects are equal", () => {
      const a: Point | null = null;
      const b: Point | null = null;
      expect(a).toEqual(b);
    });

    test("null vs non-null: not equal", () => {
      const a: Point | null = null;
      const b: Point | null = new Point(1, 2);
      expect(a).not.toEqual(b);
      expect(b).not.toEqual(a);
    });

    test("both non-null and equal", () => {
      const a: Point | null = new Point(1, 2);
      const b: Point | null = new Point(1, 2);
      expect(a).toEqual(b);
    });

    test("both non-null and different", () => {
      const a: Point | null = new Point(1, 2);
      const b: Point | null = new Point(3, 4);
      expect(a).not.toEqual(b);
    });
  });
