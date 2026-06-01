import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { runOtherUserFunction } from '../../assembly-src/user-import-missing-wrapper.meta';

describe("missing function user imports setup", () => {
  test("missing function in custom module [should fail]", () => {
    const val = runOtherUserFunction(2);
    expect(val).toBe(13);
  });
});
