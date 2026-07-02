import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { Counter, Dog, Cat } from "../../../assembly-src/coverage-collection/function/classes.meta";
import { Vec2 } from "../../../assembly-src/coverage-collection/function/operator-overload.meta";

describe("all member kinds on one class", () => {
  test("constructor, method, getter, setter; reset/make left uncovered", () => {
    const c = new Counter(5);
    c.increment();
    c.increment();
    c.value = 100;            // covered setter
    expect(c.value).toBe(100); // getter
  });
});

describe("inheritance: super() counts toward the base constructor", () => {
  test("inherited method via subclass (Dog.speak from Animal)", () => {
    const dog = new Dog("Rex");
    expect(dog.speak()).toBe("...");
  });

  test("overridden method (Dog.move overrides Animal.move)", () => {
    const dog = new Dog("Rex");
    expect(dog.move()).toBe("runs");
  });

  test("inherited method via a different subclass (Cat.speak from Animal)", () => {
    const cat = new Cat("Whiskers");
    expect(cat.speak()).toBe("...");
  });

  test("inherited method Cat does NOT override (Cat.move from Animal)", () => {
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

describe("operator overloads (@operator)", () => {
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
