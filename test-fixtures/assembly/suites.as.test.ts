import { test, describe, assertEqual, TestOptions } from '../../assembly';
import { add } from '../assembly-src/math';

test("just some test with project config defaults", () => {
  assertEqual(add(1, 2), 3);
});

test("failing test with project config defaults [should fail]", () => {
  assertEqual(add(1, 2), 4);
});

describe("suite with retry different than default [should fail]", TestOptions.retry(5), () => {
  test("nested passing test", () => {
    assertEqual(add(1, 2), 3);
  });

  test("should inherit this suite's `retry` and [should fail]", () => {
    assertEqual(true, false);
  });
  
  test("should override suite `retry` and [should fail]", TestOptions.retry(3), () => {
    assertEqual(true, false);
  });

  describe("nested suite with `fails` set [should fail]", TestOptions.fails(), () => {
    test("should get inherited retry and fail with it, then pass because inherited `fails` is true", () => {
      assertEqual(true, false);
    });
    
    test("should get inherited retry and overide `fail` to false, so that it actually [should fail]", TestOptions.fails(false), () => {
      assertEqual(true, false);
    });
  });
});