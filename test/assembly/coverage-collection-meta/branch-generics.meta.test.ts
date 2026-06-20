import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  clampGeneric, pickGeneric,
} from "../../assembly-src/coverage-collection-meta/branch-generics.meta";

// Exercises each generic branch fixture at BOTH i32 and f64 so the per-arm counts
// summed across monomorphized instances are hand-derivable. The assertions live in
// test/meta-verify/coverage-collection/branches-generics.test.ts.
describe("generic (monomorphized) branch fixtures", () => {
  // clampGeneric if (n < lo): i32 then + else, f64 then.
  test("clampGeneric: monomorphized if at i32 and f64", () => {
    expect(clampGeneric<i32>(-5, 0)).toBe(0);        // i32 then (n<lo)
    expect(clampGeneric<i32>(5, 0)).toBe(5);         // i32 implicit else
    expect(clampGeneric<f64>(-1.0, 0.0)).toBe(0.0);  // f64 then
    // if arms summed [then, implicit-else] = [2, 1]
  });

  // pickGeneric ternary: i32 then + else, f64 then.
  test("pickGeneric: monomorphized ternary at i32 and f64", () => {
    expect(pickGeneric<i32>(true, 1, 2)).toBe(1);        // i32 then
    expect(pickGeneric<i32>(false, 1, 2)).toBe(2);       // i32 else
    expect(pickGeneric<f64>(true, 1.0, 2.0)).toBe(1.0);  // f64 then
    // cond-expr arms summed [then, else] = [2, 1]
  });
});
