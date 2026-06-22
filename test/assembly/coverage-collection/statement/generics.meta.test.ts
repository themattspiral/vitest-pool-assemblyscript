import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  useI32, useF64,
} from "../../../assembly-src/coverage-collection/statement/generics.meta";

// clamp<i32>(5,0,10) returns 5 (in range); clamp<f64>(15,0,10) returns 10 (> hi).
// Each monomorphization runs clamp's statements once; AS sums them at clamp's source.
// Assertions in meta-verify/coverage-collection/statement/generics.test.ts.
describe("generic (monomorphized) statement fixtures", () => {
  test("clamp<i32> via useI32: in range", () => {
    expect(useI32()).toBe(5);
  });

  test("clamp<f64> via useF64: clamped to hi", () => {
    expect(useF64()).toBe(10.0);
  });
});
