/**
 * Assertions test suite
 * Tests comparison operators and boolean logic
 */

import { test, assert } from '../assembly';

test("comparisons work", () => {
  assert(1 < 2, "1 < 2");
  assert(2 > 1, "2 > 1");
  assert(5 == 5, "5 == 5");
  assert(10 != 11, "10 != 11");
});

test("boolean logic", () => {
  assert(true, "true is true");
  assert(!false, "!false is true");
  assert(true && true, "true && true");
  assert(true || false, "true || false");
});
