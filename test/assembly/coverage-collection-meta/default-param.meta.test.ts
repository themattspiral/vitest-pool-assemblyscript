import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { addBase } from "../../assembly-src/coverage-collection-meta/default-param-helper.meta";
import { useAddBase, makeThingFolded } from "../../assembly-src/coverage-collection-meta/default-param-consumer.meta";

// useAddBase calls addBase with the default arg omitted (twice), inlining the
// default Const; addBase is also called once with an explicit arg (control).
// makeThingFolded constructs Thing with no arg inside a folded if(true). The body
// statement/function coverage must reflect the real call counts -- the inlined
// default Const (at each definition's signature) must not pollute them.
describe("default-param attribution", () => {
  test("function default-param inlining", () => {
    expect(useAddBase(5)).toBe(105);  // addBase(5), base defaults to 100
    expect(useAddBase(3)).toBe(103);  // addBase(3), base defaults to 100
    expect(addBase(1, 2)).toBe(3);    // explicit base (control, no default inlining)
  });

  test("constructor default-param in folded if", () => {
    expect(makeThingFolded()).toBe(50);  // new Thing() defaults start to 50
    expect(makeThingFolded()).toBe(50);
  });
});
