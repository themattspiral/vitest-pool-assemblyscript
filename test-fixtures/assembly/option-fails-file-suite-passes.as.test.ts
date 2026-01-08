import { test, assert, assertEqual, describe } from '../../assembly';
import { add } from '../assembly-src/math';

describe("suite should pass when test within it uses fails option and passes", () => {
  test("should pass normally within file", () => {
    assertEqual(add(1, 2), 3);
  });
  
  test.fails("should pass with failing assertion when fails option is set", () => {
    assert(false);
  });
});

describe("another suite that should pass", () => {
  test("should pass normally within suite", () => {
    assertEqual(add(1, 2), 3);
  });
  
  describe("nested suite should pass", () => {
    test("should pass normally within nested suite", () => {
      assertEqual(add(1, 2), 3);
    });
    
    test.fails("should pass with failing assertion when fails option is set", () => {
      assert(false);
    });
  });
});
