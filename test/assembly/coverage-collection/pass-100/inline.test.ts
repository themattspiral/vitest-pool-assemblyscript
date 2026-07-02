import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  inlinedAdd, callsInlinedAdd, callsInlinedMul, callsCrossFileInlined,
} from "../../../assembly-src/coverage-collection/pass-100/inline";

describe("@inline coverage (default stripInline)", () => {
  test("inline fn direct + via wrapper, inline arrow, cross-file inline", () => {
    expect(inlinedAdd(2, 3)).toBe(5);             // direct call
    expect(callsInlinedAdd(4, 5)).toBe(9);        // wrapper inlines it
    expect(callsInlinedMul(3, 4)).toBe(12);       // inline arrow
    expect(callsCrossFileInlined(6, 1)).toBe(7);  // cross-file inline target
  });
});
