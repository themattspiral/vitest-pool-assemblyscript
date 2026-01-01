import { test, assert, TestOptions, assertEqual } from '../../assembly';
import { add } from '../assembly-src/math';

test("should pass normally within file", () => {
  assertEqual(add(1, 2), 3);
});

test("should pass with failing assertion when fails option is set, resulting in passing suite", () => {
  assert(false);
}, TestOptions.fails());
