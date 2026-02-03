import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { increment } from "../assembly-src/smoke-utils";

describe("Basic passing smoke tests", () => {
  test("simple add using expect.toBe matcher", () => {
    const x: i32 = increment(1);
    expect(x).toBe(2);
  });
});
