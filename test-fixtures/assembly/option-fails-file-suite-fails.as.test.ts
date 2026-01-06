import { test, assert, assertEqual, describe } from '../../assembly';
import { add } from '../assembly-src/math';

describe("suite should pass when test within it uses `fails` option and passes", () => {
  test("should pass normally", () => {
    assertEqual(add(1, 2), 3);
  });
  
  test.fails("should pass with a failing assertion when `fails` option is set", () => {
    assert(false);
  });
});

describe("suite that fails and will cause file suite to fail [should fail]", () => {
  test("should pass normally within this failing suite", () => {
    assertEqual(add(1, 2), 3);
  });
  
  describe("nested suite [should fail]", () => {
    test("should pass normally within this nested suite", () => {
      assertEqual(add(1, 2), 3);
    });
    
    test.fails("should fail with a passing assertion when `fails` option is set [should fail]", () => {
      assert(true);
    });
  });
});
