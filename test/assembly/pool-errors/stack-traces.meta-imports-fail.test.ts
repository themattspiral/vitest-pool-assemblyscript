import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { runMyUserFunction } from '../../assembly-src/user-import-creation-fail-wrapper.meta';

describe("malformed user imports setup", () => {
  test("creation failure [should fail]", () => {
    const val = runMyUserFunction(2);
    expect(val).toBe(13);
  });
});
