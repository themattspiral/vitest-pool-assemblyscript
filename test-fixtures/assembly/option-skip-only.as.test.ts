import { test, assert, only, skip, TestOptions, assertEqual } from '../../assembly';
import { add } from '../assembly-src/math';

test("should be skipped", () => {
  assertEqual(add(1, 2), 3);
});

test("should also be skipped", TestOptions.skip(), () => {
  assert(true);
});

only("should run", () => {
    assert(true);
});

only("should run with options", TestOptions.timeout(300), () => {
    assert(true);
});

only("should also run with options", () => {
    assert(true);
}, TestOptions.timeout(300));

skip("should be skipped too", () => {
  assert(true);
});

skip("a skip that takes options", TestOptions.timeout(300), () => {
  assert(true);
});

skip("another skip that takes options", () => {
  assert(true);
}, TestOptions.timeout(300));

test("should also run", TestOptions.only(), () => {
    assert(true);
});
