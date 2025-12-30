import { test, assert } from '../../assembly';
import { only, skip, TestOptions, testWith } from '../../assembly/test-with-api';

test("should be skipped", () => {
  assert(true);
});

testWith("should also be skipped", TestOptions.skip(), () => {
  assert(true);
});

only("should run", () => {
    assert(true);
});

skip("should be skipped too", () => {
  assert(true);
});

testWith("should also run", TestOptions.only(), () => {
    assert(true);
});
