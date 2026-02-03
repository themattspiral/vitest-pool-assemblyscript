import { test, expect, describe } from 'vitest-pool-assemblyscript/assembly';
import { add } from '../../assembly-src/quick-math';

describe("suite should pass when test within it uses `fails` option and passes", () => {
  test("should pass normally within file", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.fails("should pass with failing assertion when `fails` option is set", () => {
    expect(false).toBeTruthy();
  });
});

describe("another suite that should pass", () => {
  test("should pass normally within suite", () => {
    expect(add(1, 2)).toBe(3);
  });

  describe("nested suite should pass", () => {
    test("should pass normally within nested suite", () => {
      expect(add(1, 2)).toBe(3);
    });

    test.fails("should pass with failing assertion when `fails` option is set", () => {
      expect(false).toBeTruthy();
    });
  });
});
