import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { Dog, Cat } from "../../assembly-src/coverage-collection/multiple-classes.meta";

// Remaining structure case pending consolidation into the function/classes theme;
// the inline/generic/empty/trap cases moved to function/special-forms.meta.test.ts.
describe("multiple classes in one file", () => {
  test("Dog constructor and methods", () => {
    const dog = new Dog("Rex");
    expect(dog.name).toBe("Rex");
    expect(dog.bark()).toBe("woof");
  });

  test("Cat constructor and methods", () => {
    const cat = new Cat("Whiskers");
    expect(cat.name).toBe("Whiskers");
    expect(cat.meow()).toBe("meow");
  });
});
