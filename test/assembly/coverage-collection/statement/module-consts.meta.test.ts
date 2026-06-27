import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { TABLE_SIZE, MAX_RETRIES, ENABLED } from "../../../assembly-src/coverage-collection/statement/module-consts.meta";

// A const-only source (no functions) — exercises the loaded-file synthesis that
// credits module-level declarations folding to WASM globals. Assertions in
// meta-verify/coverage-collection/statement/module-consts.test.ts.
describe("const-only module", () => {
  test("module-level constants are imported and usable", () => {
    expect(TABLE_SIZE).toBe(1024);
    expect(MAX_RETRIES).toBe(3);
    expect(ENABLED).toBe(true);
  });
});
