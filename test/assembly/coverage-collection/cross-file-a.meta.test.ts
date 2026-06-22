import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { sharedFunc, fileAOnly } from "../../assembly-src/coverage-collection/cross-file-coverage.meta";

// Cross-file coverage merging: file A of 2.
// Calls sharedFunc 2 times and fileAOnly 1 time.
// Combined with cross-file-b, sharedFunc total should be 5 (2 + 3).

describe("cross-file A", () => {
  test("calls sharedFunc and fileAOnly", () => {
    expect(sharedFunc()).toBe(100);
    sharedFunc();
    expect(fileAOnly()).toBe(200);
  });
});
