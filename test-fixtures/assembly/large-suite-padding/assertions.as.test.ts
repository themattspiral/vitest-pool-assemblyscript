/**
 * Assertions test suite
 * Tests comparison operators and boolean logic
 */

import { test, expect } from '../../../assembly';
import { lessThan, greaterThan, equals, notEquals, andOp, orOp, notOp } from '../../assembly-src/comparison-utils';

test("comparisons work", () => {
  expect(lessThan(1, 2)).toBeTruthy();
  expect(greaterThan(2, 1)).toBeTruthy();
  expect(equals(5, 5)).toBeTruthy();
  expect(notEquals(10, 11)).toBeTruthy();
});

test("boolean logic", () => {
  expect(true).toBeTruthy();
  expect(notOp(false)).toBeTruthy();
  expect(andOp(true, true)).toBeTruthy();
  expect(orOp(true, false)).toBeTruthy();
});
