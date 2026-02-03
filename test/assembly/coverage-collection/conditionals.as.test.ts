/**
 * Conditional logic tests
 */

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
import { max, min, abs, categorize } from '../../assembly-src/conditional-utils';

test('max function', () => {
  expect(max(5, 3)).toBe(5);
  expect(max(2, 8)).toBe(8);
  expect(max(-5, -10)).toBe(-5);
});

test('min function', () => {
  expect(min(5, 3)).toBe(3);
  expect(min(2, 8)).toBe(2);
  expect(min(-5, -10)).toBe(-10);
});

test('abs function', () => {
  expect(abs(5)).toBe(5);
  expect(abs(-5)).toBe(5);
  expect(abs(0)).toBe(0);
});

test('nested ternary', () => {
  const result = categorize(15);
  expect(result).toBe(2);
});
