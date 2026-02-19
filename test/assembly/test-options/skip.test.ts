import { test, expect, TestOptions, describe } from "vitest-pool-assemblyscript/assembly";
import { add } from "../../assembly-src/quick-math";

test.skip("skipped test", () => {
  expect(add(1, 2)).toBe(3);
});

test("skipped via option", TestOptions.skip(), () => {
  expect(true).toBeTruthy();
});

describe.skip("skipped suite", () => {
  test("test in skipped suite", () => {
    expect(add(1, 2)).toBe(3);
  });
});
