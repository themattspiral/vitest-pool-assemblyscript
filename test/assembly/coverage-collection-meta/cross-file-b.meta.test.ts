import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { sharedFunc, fileBOnly } from "../../assembly-src/coverage-collection-meta/cross-file-coverage.meta";

// Cross-file coverage merging: file B of 2.
// Calls sharedFunc 3 times and fileBOnly 1 time.
// Combined with cross-file-a, sharedFunc total should be 5 (2 + 3).

describe("cross-file B", () => {
  test("calls sharedFunc and fileBOnly", () => {
    sharedFunc();
    sharedFunc();
    expect(sharedFunc()).toBe(100);
    expect(fileBOnly()).toBe(300);
  });
});
