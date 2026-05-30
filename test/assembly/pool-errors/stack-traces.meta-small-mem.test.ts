import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { growBoom } from "../../assembly-src/failure-utils.meta";

describe("small memory setup", () => {
  test("out of memory runtime error [should fail]", () => {
    const big = growBoom();
    expect(big).not.toBeNull();
  });
});
