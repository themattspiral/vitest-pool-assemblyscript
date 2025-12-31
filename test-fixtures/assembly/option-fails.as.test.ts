import { test, assert, fails, TestOptions } from '../../assembly';

test("should pass normally", () => {
  assert(true);
});

test("should pass with failing assertion when fails option is set", TestOptions.fails(), () => {
  assert(false);
});

fails("should pass with failing assertion when fails function is used", () => {
  assert(false);
});

fails("should not pass with passing assertion when fails option is set [should fail]", () => {
  assert(true);
});

fails("should pass with failing assertion when fails function is used with options", TestOptions.retry(3), () => {
  assert(false);
});

fails("should pass with failing assertion when fails function is used with options also", () => {
  assert(false);
}, TestOptions.retry(3));
