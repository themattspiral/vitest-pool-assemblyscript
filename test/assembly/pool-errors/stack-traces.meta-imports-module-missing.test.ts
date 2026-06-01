import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { runYetAnotherFunction } from '../../assembly-src/user-import-missing-wrapper.meta';

describe("missing module user imports setup", () => {
  test("missing custom module [should fail]", () => {
    const val = runYetAnotherFunction(2);
    expect(val).toBe(13);
  });
});
