import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { runMyUserFunction } from '../../assembly-src/user-import-fail-wrapper.meta';

describe("nonexistent user imports setup", () => {
  test("load failure [should fail]", () => {
    const val = runMyUserFunction(2);
    expect(val).toBe(13);
  });
});
