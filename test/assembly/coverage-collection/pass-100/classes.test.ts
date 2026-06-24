import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { Counter, Animal, Dog, Vec2 } from "../../../assembly-src/coverage-collection/pass-100/classes";

describe("class members", () => {
  test("Counter: ctor (default + explicit), method, getter, setter, @inline, private, static", () => {
    const c = new Counter();             // defaulted constructor
    c.increment();
    c.value = 5;                         // setter
    expect(c.value).toBe(5);             // getter
    expect(c.doubled()).toBe(10);        // @inline method
    expect(c.callsPrivate()).toBe(15);   // private tripled (5*3)
    const c2 = Counter.startingAt(3);    // static + explicit constructor
    expect(c2.value).toBe(3);
  });

  test("inheritance + super; base method covered via a direct base instance", () => {
    const a = new Animal("a");
    expect(a.describe()).toBe("a");          // Animal#describe (not overridden here)
    const d = new Dog("rex");                // super() → Animal constructor
    expect(d.describe()).toBe("rex (dog)");  // Dog#describe override
    expect(d.bark()).toBe("woof");
  });

  test("operator overload + method", () => {
    const v = new Vec2(3.0, 4.0);
    const sum = v + new Vec2(1.0, 1.0);      // @operator("+") add
    expect(sum.x).toBeCloseTo(4.0);
    expect(v.magnitude()).toBeCloseTo(5.0);
  });
});
