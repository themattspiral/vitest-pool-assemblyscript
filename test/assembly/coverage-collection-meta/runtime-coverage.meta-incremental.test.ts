import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { skipUnderIncremental, driftAcrossRuntimes } from "../../assembly-src/coverage-collection-meta/runtime-coverage.meta";

// Incremental-runtime half of the runtime-coverage guard. Runs ONLY in the
// as-pool-meta-incremental project (--runtime incremental); the `.meta-incremental`
// suffix keeps the default as-pool-meta (stub) project from also picking it up. Calls
// each function once, so its coverage accumulates with the stub run across two binaries.
test("runtime-coverage (incremental runtime)", () => {
  expect(skipUnderIncremental()).toBe(5);
  expect(driftAcrossRuntimes()).toBe(8);
});
