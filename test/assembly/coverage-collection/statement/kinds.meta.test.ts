import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  declarators, expressions, loopControl, maybeThrow,
} from "../../../assembly-src/coverage-collection/statement/kinds.meta";

// Known inputs so each statement kind's hit count is hand-derivable. maybeThrow(5)
// leaves the Throw uncovered (avoids the AS-abort vs JS-exception behavior split,
// keeping parity on the throw statement).
describe("statement-kind fixtures", () => {
  test("declarators: multi-declarator variable", () => {
    expect(declarators()).toBe(6); // 1 + 2 + 3
  });

  test("expressions: assign / increment / call", () => {
    expect(expressions(5)).toBe(7); // 5 → +1 → ++ → 7
  });

  test("loopControl(5): continue at i==1, break at i==3", () => {
    expect(loopControl(5)).toBe(2); // i=0(+0) skip i=1 i=2(+2) break i=3
  });

  test("maybeThrow(5): throw NOT taken", () => {
    expect(maybeThrow(5)).toBe(5);
  });
});
