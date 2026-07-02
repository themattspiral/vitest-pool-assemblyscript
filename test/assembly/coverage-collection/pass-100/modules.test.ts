import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { MathNS, Shapes, BASE, readBase } from "../../../assembly-src/coverage-collection/pass-100/modules";

describe("namespaces + module-scope code", () => {
  test("namespace functions + namespace class", () => {
    expect(MathNS.squared(4)).toBe(16);
    expect(MathNS.cubed(2)).toBe(8);
    const c = new Shapes.Circle(2.0);
    expect(c.area()).toBeCloseTo(12.56636);
  });

  test("module-scope const initialized via a function call", () => {
    expect(BASE).toBe(7);
    expect(readBase()).toBe(7);
  });
});
