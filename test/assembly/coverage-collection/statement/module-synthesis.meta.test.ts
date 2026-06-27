import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { ALWAYS_CONST, ALWAYS_LET, gate } from "../../../assembly-src/coverage-collection/statement/module-synthesis.meta";

// gate() is false, so the module-level `if` block never runs (ALWAYS_LET stays 20).
// That leaves the in-block `const NEVER` genuinely uncovered — the case the synthesis
// must NOT credit. Assertions in
// meta-verify/coverage-collection/statement/module-synthesis.test.ts.
describe("module-declaration synthesis", () => {
  test("unconditional decls usable; the conditional block did not run", () => {
    expect(ALWAYS_CONST).toBe(10);
    expect(ALWAYS_LET).toBe(20);
    expect(gate()).toBe(false);
  });
});
