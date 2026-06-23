import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { MixedCounter } from "../../assembly-src/coverage-collection/class-with-mixed-usage.meta";

// Remaining class case pending consolidation into the function/classes theme; the
// math-helpers and call-counting cases moved to function/counting.meta.test.ts.
describe("class partial coverage", () => {
  test("uses constructor, increment, and value getter", () => {
    const counter = new MixedCounter(0);
    counter.increment();
    counter.increment();
    counter.increment();
    expect(counter.value).toBe(3);
  });
});
