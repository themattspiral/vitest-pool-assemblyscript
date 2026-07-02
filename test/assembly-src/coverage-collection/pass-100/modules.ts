/**
 * Namespaces + module-scope code for the 100% passing set: namespace functions, a
 * namespace class, and a module-level constant initialized by a function call at load
 * time. Branch-free; the driver calls each export (module-scope code runs on
 * instantiation), so every function/statement/line is covered.
 */

export namespace MathNS {
  export function squared(x: i32): i32 {
    return x * x;
  }

  export function cubed(x: i32): i32 {
    return x * x * x;
  }
}

export namespace Shapes {
  export class Circle {
    radius: f64;

    constructor(radius: f64) {
      this.radius = radius;
    }

    area(): f64 {
      return 3.14159 * this.radius * this.radius;
    }
  }
}

// Module-scope executable code: this runs once when the module is instantiated.
function computeBase(): i32 {
  return 7;
}

export const BASE: i32 = computeBase();

export function readBase(): i32 {
  return BASE;
}
