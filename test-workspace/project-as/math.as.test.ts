/**
 * Simple AssemblyScript math tests for hybrid coverage POC
 */

import { test, assert } from '../../assembly';
import { add, multiply } from './math.as';

// Tests that call add and multiply
test('add works', () => {
  const result: i32 = add(2, 3);
  assert(result == 5);
});

test('add with negatives', () => {
  const result: i32 = add(-1, 1);
  assert(result == 0);
});

test('multiply works', () => {
  const result: i32 = multiply(3, 4);
  assert(result == 12);
});

test('multiply by zero', () => {
  const result: i32 = multiply(5, 0);
  assert(result == 0);
});

// Note: unused() function is not called, should show 0 hits in coverage
