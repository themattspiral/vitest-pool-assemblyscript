import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { Animal, Dog, Cat } from "../../assembly-src/coverage-collection-meta/class-inheritance.meta";
import { Vec2 } from "../../assembly-src/coverage-collection-meta/operator-overload.meta";

describe("class inheritance coverage", () => {
  test("call inherited method via subclass (Dog.speak from Animal)", () => {
    const dog = new Dog("Rex");
    expect(dog.speak()).toBe("...");
  });

  test("call overridden method (Dog.move overrides Animal.move)", () => {
    const dog = new Dog("Rex");
    expect(dog.move()).toBe("runs");
  });

  test("call inherited method via different subclass (Cat.speak from Animal)", () => {
    const cat = new Cat("Whiskers");
    expect(cat.speak()).toBe("...");
  });

  test("call inherited method that Cat does NOT override (Cat.move from Animal)", () => {
    const cat = new Cat("Whiskers");
    expect(cat.move()).toBe("moves");
  });

  test("Dog-only method", () => {
    const dog = new Dog("Rex");
    expect(dog.bark()).toBe("woof");
  });

  test("Cat-only method", () => {
    const cat = new Cat("Whiskers");
    expect(cat.meow()).toBe("meow");
  });

  test("name getter via subclass", () => {
    const dog = new Dog("Rex");
    expect(dog.name).toBe("Rex");
  });
});

describe("operator overload coverage", () => {
  test("use + operator (triggers @operator add)", () => {
    const a = new Vec2(1.0, 2.0);
    const b = new Vec2(3.0, 4.0);
    const c = a + b;
    expect(c.x).toBeCloseTo(4.0);
    expect(c.y).toBeCloseTo(6.0);
  });

  test("use == operator (triggers @operator equals)", () => {
    const a = new Vec2(1.0, 2.0);
    const b = new Vec2(1.0, 2.0);
    expect(a == b).toBe(true);
  });

  test("regular method for comparison", () => {
    const v = new Vec2(3.0, 4.0);
    expect(v.length()).toBeCloseTo(5.0);
  });
});
