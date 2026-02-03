import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { add } from "../../assembly-src/quick-math";

describe("suite should pass when test within it uses `fails` option and passes", () => {
  test("should pass normally", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.fails("should pass with a failing assertion when `fails` option is set", () => {
    expect(false).toBeTruthy();
  });
});

describe("suite that fails and will cause file suite to fail", () => {
  test("should pass normally within this failing suite", () => {
    expect(add(1, 2)).toBe(3);
  });

  describe("nested suite", () => {
    test("should pass normally within this nested suite", () => {
      expect(add(1, 2)).toBe(3);
    });

    test.fails("should fail with a passing assertion when `fails` option is set [should fail]", () => {
      expect(true).toBeTruthy();
    });
  });
});
