import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { slAdd, SLThing } from "../../../assembly-src/coverage-collection/statement/single-line-default.meta";

// slAdd's body and SLThing's constructor body each run 3x, while the test block
// (which inlines the default Const 3x at each definition's `= N` site) runs once.
// So each body statement's correct count is 6 across the 2-binary debug config
// (3 per binary); a count of 2 would mean the inlined default Const polluted it.
test("single-line default params", () => {
  expect(slAdd(1)).toBe(101);
  expect(slAdd(2)).toBe(102);
  expect(slAdd(3)).toBe(103);

  const a = new SLThing();
  const b = new SLThing();
  const c = new SLThing();
  expect(a.v + b.v + c.v).toBe(150);
});
