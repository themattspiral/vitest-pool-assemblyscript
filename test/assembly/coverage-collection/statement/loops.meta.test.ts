import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  forSum, whileCountdown, doAtLeastOnce, nestedLoops, neverLooped,
} from "../../../assembly-src/coverage-collection/statement/loops.meta";

// Exercises the loop fixtures with KNOWN iteration counts so each statement's hit
// count is hand-derivable (D11: the loop header is reached once per call; the body
// runs N times). Assertions live in
// meta-verify/coverage-collection/statement/loops.test.ts.
describe("loop statement fixtures", () => {
  test("forSum(4): body runs 4x", () => {
    expect(forSum(4)).toBe(6); // 0 + 1 + 2 + 3
  });

  test("whileCountdown(3): body runs 3x", () => {
    expect(whileCountdown(3)).toBe(3);
  });

  test("doAtLeastOnce(2): body runs 2x", () => {
    expect(doAtLeastOnce(2)).toBe(2);
  });

  test("nestedLoops(2,3): inner body runs 6x, outer 2x", () => {
    expect(nestedLoops(2, 3)).toBe(6);
  });

  test("neverLooped(0): body never runs (uncovered), function still covered", () => {
    expect(neverLooped(0)).toBe(0);
  });
});
