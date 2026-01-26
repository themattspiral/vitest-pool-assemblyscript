import { test, assert, TestOptions, assertEqual, describe } from '../../../assembly';
import { add } from '../../assembly-src/math';

test.skip("should be skipped!!", () => {
  assertEqual(add(1, 2), 3);
});

test("should also be skipped!!", TestOptions.skip(), () => {
  assert(true);
});

test.skip("skip is idempotent: should be skipped when both `skip` function is used and option is set", TestOptions.skip(), () => {
  assert(true);
});

describe.skip("suite using `skip` function  should be skipped regardless of options on tests in it", () => {
  test("should be skipped because it's in a skipped suite", () => {
    assert(true);
  });
  
  test.skip("should also be skipped because it's in a skipped suite and also uses `skip` function", () => {
    assert(true);
  });
  
  test("should also be skipped because it's in a skipped suite and also has `skip` option set", TestOptions.skip(), () => {
    assert(true);
  });

  describe("nested suite should be skipped because it's in a skipped suite", () => {
    test("plain should be skipped because it's in a skipped suite", () => {
      assert(true);
    });
    
    test.skip("should be skipped because it's in a skipped suite", () => {
      assert(true);
    });
  });
});

describe("suite with `skip` option set should be skipped regardless of options on tests in it", TestOptions.skip(), () => {
  test("should be skipped because it's in a skipped suite", () => {
    assert(true);
  });

  describe("nested suite should be skipped because it's in a skipped suite", () => {
    test("plain - should be skipped because it's in a nested skipped suite", () => {
      assert(true);
    });
    
    test.skip("`skip` - should be skipped because it's in a nested skipped suite", () => {
      assert(true);
    });
  });
});