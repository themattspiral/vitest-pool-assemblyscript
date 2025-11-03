/**
 * Conditional logic tests
 */

import { test, assert } from '../../assembly';
import { max, min, abs, categorize } from '../assembly-src/conditional-utils';

test('max function', () => {
  assert(max(5, 3) == 5);
  assert(max(2, 8) == 8);
  assert(max(-5, -10) == -5);
});

test('min function', () => {
  assert(min(5, 3) == 3);
  assert(min(2, 8) == 2);
  assert(min(-5, -10) == -10);
});

test('abs function', () => {
  assert(abs(5) == 5);
  assert(abs(-5) == 5);
  assert(abs(0) == 0);
});

test('nested ternary', () => {
  const result = categorize(15);
  assert(result == 2);
});
