/**
 * Assertions test suite
 * Tests comparison operators and boolean logic
 */

import { test, assert } from '../../../assembly';
import { lessThan, greaterThan, equals, notEquals, andOp, orOp, notOp } from '../../assembly-src/comparison-utils';

test("comparisons work", () => {
  assert(lessThan(1, 2), "1 < 2");
  assert(greaterThan(2, 1), "2 > 1");
  assert(equals(5, 5), "5 == 5");
  assert(notEquals(10, 11), "10 != 11");
});

test("boolean logic", () => {
  assert(true, "true is true");
  assert(notOp(false), "!false is true");
  assert(andOp(true, true), "true && true");
  assert(orOp(true, false), "true || false");
});
