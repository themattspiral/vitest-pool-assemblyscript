import { test, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { fails } from "../assembly-src/failure-utils.external";
import { fibonacciRecursive } from "../assembly-src/computation-utils";

test("as smoke fail [should fail]", () => {
  const x: i32 = fails();
  expect(x).toBe(2);
});

test("as smoke fail long running [should fail]", TestOptions.timeout(50).retry(1), () => {
  const res = fibonacciRecursive(37);

  // if we get here we didn"t timeout correctly
  expect("Didn't timeout").toBe("timed out");
});
