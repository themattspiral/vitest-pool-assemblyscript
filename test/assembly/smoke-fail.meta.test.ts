import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { fails } from "../assembly-src/failure-utils.meta";

test("as smoke fail [should fail]", () => {
  const x: i32 = fails();
  expect(x).toBe(2);
});
