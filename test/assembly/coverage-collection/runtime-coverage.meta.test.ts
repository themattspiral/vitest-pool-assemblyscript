import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { skipUnderIncremental, driftAcrossRuntimes } from "../../assembly-src/coverage-collection/runtime-coverage.meta";

// Stub (default runtime) half of the runtime-coverage guard. The incremental half runs
// the same source via runtime-coverage.meta-incremental.test.ts; their coverage
// accumulates across two binaries. Calls each function once.
test("runtime-coverage (stub runtime)", () => {
  expect(skipUnderIncremental()).toBe(5);
  expect(driftAcrossRuntimes()).toBe(8);
});
