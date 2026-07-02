import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import { makeDefaultWidget, useProviderHelper } from "../../../assembly-src/coverage-collection/pass-100/cross-file-consumer";

describe("cross-file coverage attribution", () => {
  test("defaulted constructor inlined across a file boundary; provider helper", () => {
    expect(makeDefaultWidget()).toBe(100); // new Widget() → size 10 → area 100
    expect(useProviderHelper()).toBe(43);  // 42 + 1
  });
});
