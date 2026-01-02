import { test, assert, TestOptions, assertEqual } from '../../assembly';
import { add } from '../assembly-src/math';

test("should pass normally", () => {
  assertEqual(add(1, 2), 3);
});

test("should pass with failing assertion when fails option is set", TestOptions.fails(), () => {
  assert(false);
});

test.fails("should pass with failing assertion when fails function is used", () => {
  assert(false);
});

test.fails("should not pass with passing assertion when fails option is set [should fail]", () => {
  assert(true);
});

test.fails("should pass with failing assertion when fails function is used with options", TestOptions.retry(3), () => {
  assert(false);
});

test.fails("should pass with failing assertion when fails function is used with options also", () => {
  assert(false);
}, TestOptions.retry(3));
