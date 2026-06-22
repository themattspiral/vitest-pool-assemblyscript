import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  classify, earlyReturn, guarded,
} from "../../../assembly-src/coverage-collection/statement/reachability.meta";

// Known inputs so each statement's hit count is hand-derivable. classify covers
// both arms (the both-return Unreachable case); earlyReturn(5) leaves the early-
// return body genuinely uncovered next to covered post-if statements (the
// matching-miss differentiator); guarded(true) covers the conditional body.
// Assertions in meta-verify/coverage-collection/statement/reachability.test.ts.
describe("reachability statement fixtures", () => {
  test("classify: both arms covered (if/else both return)", () => {
    expect(classify(5)).toBe(1);
    expect(classify(-5)).toBe(-1);
  });

  test("earlyReturn(5): early-return body NOT taken; post-if covered", () => {
    expect(earlyReturn(5)).toBe(10);
  });

  test("guarded(true): conditional body covered", () => {
    expect(guarded(true)).toBe(10);
  });
});
