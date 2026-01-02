import { test, assert, TestOptions, assertEqual } from '../../assembly';
import { add } from '../assembly-src/math';

test("should be skipped", () => {
  assertEqual(add(1, 2), 3);
});

test("should also be skipped", TestOptions.skip(), () => {
  assert(true);
});

test.only("should run", () => {
    assert(true);
});

test.only("should run with options", TestOptions.timeout(300), () => {
    assert(true);
});

test.only("should also run with options", () => {
    assert(true);
}, TestOptions.timeout(300));

test.skip("should be skipped too", () => {
  assert(true);
});

test.skip("a skip that takes options", TestOptions.timeout(300), () => {
  assert(true);
});

test.skip("another skip that takes options", () => {
  assert(true);
}, TestOptions.timeout(300));

test("should also run", TestOptions.only(), () => {
    assert(true);
});
