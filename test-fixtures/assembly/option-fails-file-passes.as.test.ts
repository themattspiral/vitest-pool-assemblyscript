import { test, assert, TestOptions } from '../../assembly';

test("should pass normally within file", () => {
  assert(true);
});

test("should pass with failing assertion when fails option is set, resulting in passing suite", () => {
  assert(false);
}, TestOptions.fails());
