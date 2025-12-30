import { test, assert } from '../../assembly';
import { TestOptions, testWith } from '../../assembly/test-with-api';

test("should pass normally within file", () => {
  assert(true);
});

testWith("should pass with failing assertion when fails option is set, resulting in passing suite", TestOptions.fails(), () => {
  assert(false);
});
