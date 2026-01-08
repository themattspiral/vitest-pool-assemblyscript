import { test, assert, TestOptions, assertEqual, describe } from '../../assembly';
import { add } from '../assembly-src/math';

test("plain test should be skipped in file with only", () => {
  assertEqual(add(1, 2), 3);
});

test.skip("test with `skip` func should be skipped", () => {
  assertEqual(add(1, 2), 3);
});

test("should with `skip` option also be skipped", TestOptions.skip(), () => {
  assert(true);
});

test.only("test with only func should run", () => {
    assert(true);
});

test.only("test with only func should run with other options", TestOptions.timeout(300), () => {
    assert(true);
});

test.only("should also run with options", () => {
    assert(true);
}, TestOptions.timeout(300));

test.skip("should be skipped too", () => {
  assert(true);
});

test.skip("a skip that takes options", TestOptions.timeout(300), () => {
  assert(true);
});

test.skip("another skip that takes options", () => {
  assert(true);
}, TestOptions.timeout(300));

test("should also run", TestOptions.only(), () => {
    assert(true);
});

describe("plain suite with same-level `only` - should be skipped", () => {
  test("plain test: should be skipped because the suite gets set to skipped", () => {
    assertEqual(add(1, 2), 3);
  });
  
  test.skip("`skip` test: should be skipped (suite implicit skip, test explicit skip)", () => {
    assertEqual(add(1, 2), 3);
  });

  describe("nested plain suite should be skipped", () => {
    test("plain test: should be skipped because the suite parent hierarchy is skipped", () => {
      assertEqual(add(1, 2), 3);
    });
  });
});

describe("plain suite with same-level `only` and `only` nested suite - should run", () => {
  test("plain test: should be skipped despite suite run again (onlies elsewhere in file)", () => {
    assertEqual(add(1, 2), 3);
  });
  
  test.skip("`skip` test: should be skipped again (test uses `skip` explicitly, regardless of suite skip state)", () => {
    assertEqual(add(1, 2), 3);
  });

  describe.only("`only` suite within plain suite should run with other file onlies", () => {
    test("plain test: should run within nested suite marked only", () => {
      assertEqual(add(1, 2), 3);
    });
  
    test.skip("`skip` test: should be skipped (test uses `skip` explicitly, regardless of suite only state)", () => {
      assertEqual(add(1, 2), 3);
    });
  });
});

describe("plain suite with same-level `only` and `only` sub-test - should run", () => {
  test("plain test: should be skipped despite suite run (onlies elsewhere in file)", () => {
    assertEqual(add(1, 2), 3);
  });
  
  test.skip("`skip` test: should be skipped (test uses `skip` explicitly, regardless of suite run due to other test running)", () => {
    assertEqual(add(1, 2), 3);
  });

  test.only("`only` test within plain suite should run with other file onlies", () => {
    assert(true);
  });
});

describe.skip("`skip` suite: should have all tests skipped regardless of their options", () => {
  test("plain test: should be skipped (suite is skipped)", () => {
    assertEqual(add(1, 2), 3);
  });
  
  test.skip("`skip` test: should be skipped (both suite and test use `skip`)", () => {
    assertEqual(add(1, 2), 3);
  });

  test.only("`only` test: should be skipped because suite is skipped despite `only` function", () => {
    assert(true);
  });
});

describe.only("`only` suite: should run with other onlies", () => {
  test("plain test: should run in only suite", () => {
    assertEqual(add(1, 2), 3);
  });
  
  test.skip("`skip` test: should be skipped (test is explicitly skipped)", () => {
    assertEqual(add(1, 2), 3);
  });

  test.only("`only` test: should run within `only` suite", () => {
    assert(true);
  });
});
