import { test, expect, TestOptions, describe } from 'vitest-pool-assemblyscript/assembly';
import { add } from '../../assembly-src/quick-math';

test("plain test should be skipped in file with only", () => {
  expect(add(1, 2)).toBe(3);
});

test.skip("test with `skip` func should be skipped", () => {
  expect(add(1, 2)).toBe(3);
});

test("should with `skip` option also be skipped", TestOptions.skip(), () => {
  expect(true).toBeTruthy();
});

test.only("test with only func should run", () => {
  expect(true).toBeTruthy();
});

test.only("test with only func should run with other options", TestOptions.timeout(300), () => {
  expect(true).toBeTruthy();
});

test.only("should also run with options", () => {
  expect(true).toBeTruthy();
}, TestOptions.timeout(300));

test.skip("should be skipped too", () => {
  expect(true).toBeTruthy();
});

test.skip("a skip that takes options", TestOptions.timeout(300), () => {
  expect(true).toBeTruthy();
});

test.skip("another skip that takes options", () => {
  expect(true).toBeTruthy();
}, TestOptions.timeout(300));

test("should also run", TestOptions.only(), () => {
  expect(true).toBeTruthy();
});

describe("plain suite with same-level `only` - should be skipped", () => {
  test("plain test: should be skipped because the suite gets set to skipped", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.skip("`skip` test: should be skipped (suite implicit skip, test explicit skip)", () => {
    expect(add(1, 2)).toBe(3);
  });

  describe("nested plain suite should be skipped", () => {
    test("plain test: should be skipped because the suite parent hierarchy is skipped", () => {
      expect(add(1, 2)).toBe(3);
    });
  });
});

describe("plain suite with same-level `only` and `only` nested suite - should run", () => {
  test("plain test: should be skipped despite suite run again (onlies elsewhere in file)", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.skip("`skip` test: should be skipped again (test uses `skip` explicitly, regardless of suite skip state)", () => {
    expect(add(1, 2)).toBe(3);
  });

  describe.only("`only` suite within plain suite should run with other file onlies", () => {
    test("plain test: should run within nested suite marked only", () => {
      expect(add(1, 2)).toBe(3);
    });

    test.skip("`skip` test: should be skipped (test uses `skip` explicitly, regardless of suite only state)", () => {
      expect(add(1, 2)).toBe(3);
    });
  });
});

describe("plain suite with same-level `only` and `only` sub-test - should run", () => {
  test("plain test: should be skipped despite suite run (onlies elsewhere in file)", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.skip("`skip` test: should be skipped (test uses `skip` explicitly, regardless of suite run due to other test running)", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.only("`only` test within plain suite should run with other file onlies", () => {
    expect(true).toBeTruthy();
  });
});

describe.skip("`skip` suite: should have all tests skipped regardless of their options", () => {
  test("plain test: should be skipped (suite is skipped)", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.skip("`skip` test: should be skipped (both suite and test use `skip`)", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.only("`only` test: should be skipped because suite is skipped despite `only` function", () => {
    expect(true).toBeTruthy();
  });
});

describe.only("`only` suite: should run with other onlies", () => {
  test("plain test: should run in only suite", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.skip("`skip` test: should be skipped (test is explicitly skipped)", () => {
    expect(add(1, 2)).toBe(3);
  });

  test.only("`only` test: should run within `only` suite", () => {
    expect(true).toBeTruthy();
  });
});
