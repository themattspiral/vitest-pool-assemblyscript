import { test, describe, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { add } from "../../assembly-src/quick-math";

test("just some test with project config defaults", () => {
  expect(add(1, 2)).toBe(3);
});

test("failing test with project config defaults [should fail]", () => {
  expect(add(1, 2)).toBe(4);
});

describe("suite with retry different than default", TestOptions.retry(5), () => {
  test("nested passing test", () => {
    expect(add(1, 2)).toBe(3);
  });

  test("should inherit this suite"s `retry` and [should fail]", () => {
    expect(true).toBe(false);
  });

  test("should override suite `retry` and [should fail]", TestOptions.retry(3), () => {
    expect(true).toBe(false);
  });

  describe("nested suite with `fails` set", TestOptions.fails(), () => {
    test("should get inherited retry and fail with it, then pass because inherited `fails` is true", () => {
      expect(true).toBe(false);
    });

    test("should get inherited retry and overide `fail` to false, so that it actually [should fail]", TestOptions.fails(false), () => {
      expect(true).toBe(false);
    });
  });
});