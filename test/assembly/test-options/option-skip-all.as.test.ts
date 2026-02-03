import { test, expect, TestOptions, describe } from 'vitest-pool-assemblyscript/assembly';
import { add } from '../../assembly-src/quick-math';

test.skip("should be skipped!!", () => {
  expect(add(1, 2)).toBe(3);
});

test("should also be skipped!!", TestOptions.skip(), () => {
  expect(true).toBeTruthy();
});

test.skip("skip is idempotent: should be skipped when both `skip` function is used and option is set", TestOptions.skip(), () => {
  expect(true).toBeTruthy();
});

describe.skip("suite using `skip` function  should be skipped regardless of options on tests in it", () => {
  test("should be skipped because it's in a skipped suite", () => {
    expect(true).toBeTruthy();
  });

  test.skip("should also be skipped because it's in a skipped suite and also uses `skip` function", () => {
    expect(true).toBeTruthy();
  });

  test("should also be skipped because it's in a skipped suite and also has `skip` option set", TestOptions.skip(), () => {
    expect(true).toBeTruthy();
  });

  describe("nested suite should be skipped because it's in a skipped suite", () => {
    test("plain should be skipped because it's in a skipped suite", () => {
      expect(true).toBeTruthy();
    });

    test.skip("should be skipped because it's in a skipped suite", () => {
      expect(true).toBeTruthy();
    });
  });
});

describe("suite with `skip` option set should be skipped regardless of options on tests in it", TestOptions.skip(), () => {
  test("should be skipped because it's in a skipped suite", () => {
    expect(true).toBeTruthy();
  });

  describe("nested suite should be skipped because it's in a skipped suite", () => {
    test("plain - should be skipped because it's in a nested skipped suite", () => {
      expect(true).toBeTruthy();
    });

    test.skip("`skip` - should be skipped because it's in a nested skipped suite", () => {
      expect(true).toBeTruthy();
    });
  });
});