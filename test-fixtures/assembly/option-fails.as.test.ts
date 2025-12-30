import { test, assert } from '../../assembly';
import { fails, TestOptions, testWith } from '../../assembly/test-with-api';

test("should pass normally", () => {
  assert(true);
});

testWith("should pass with failing assertion when fails option is set", TestOptions.fails(), () => {
  assert(false);
});

fails("should pass with failing assertion when fails function is used", () => {
  assert(false);
});

fails("should not pass with passing assertion when fails option is set [should fail]", () => {
  assert(true);
});
