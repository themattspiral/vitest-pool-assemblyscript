import { test, assert, TestOptions, assertEqual } from '../../assembly';
import { add } from '../assembly-src/math';

test.skip("should be skipped!!", () => {
  assertEqual(add(1, 2), 3);
});

test("should also be skipped!!", TestOptions.skip(), () => {
  assert(true);
});

test.skip("should be skipped too (everything is)!!", TestOptions.skip(), () => {
  assert(true);
});
