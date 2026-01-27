/**
 * Loop tests
 */

import { test, expect } from '../../../assembly';
import { sumRange, countdown, nestedLoopSum } from '../../assembly-src/loop-utils';

test('for loop sum', () => {
  const sum = sumRange(1, 100);
  expect(sum).toBe(5050);
});

test('while loop countdown', () => {
  const iterations = countdown(10);
  expect(iterations).toBe(10);
});

test('nested loops', () => {
  const sum = nestedLoopSum(10, 10);
  expect(sum).toBe(2025);
});
