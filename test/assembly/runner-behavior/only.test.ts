import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { add } from "../../assembly-src/quick-math";

test("plain test implicitly skipped by only", () => {
  expect(add(1, 2)).toBe(3);
});

test.only("only test should run", () => {
  expect(add(1, 2)).toBe(3);
});

describe.only("only suite should run", () => {
  test("test in only suite", () => {
    expect(add(1, 2)).toBe(3);
  });
});
