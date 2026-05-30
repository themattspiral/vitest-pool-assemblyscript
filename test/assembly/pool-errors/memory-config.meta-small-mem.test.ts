import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { allocBoom } from '../../assembly-src/memory-utils.meta';

describe("small memory setup", () => {
  test("code requiring bigger initial memory than configured [should fail]", () => {
    const big = allocBoom();
    expect(big).not.toBeNull();
  });
});
