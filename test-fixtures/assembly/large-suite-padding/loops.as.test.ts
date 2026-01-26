/**
 * Loop tests
 */

import { test, assert } from '../../../assembly';
import { sumRange, countdown, nestedLoopSum } from '../../assembly-src/loop-utils';

test('for loop sum', () => {
  const sum = sumRange(1, 100);
  assert(sum == 5050);
});

test('while loop countdown', () => {
  const iterations = countdown(10);
  assert(iterations == 10);
});

test('nested loops', () => {
  const sum = nestedLoopSum(10, 10);
  assert(sum == 2025);
});
