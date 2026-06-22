import { test, expect } from 'vitest';
import { unique, chunk, last, compact, range } from '../js-coverage-parity-src/array-utils.js';

// Exercises ~75-80% of array-utils functions
// zip is intentionally untested

test('unique', () => {
  expect(unique([1, 2, 2, 3])).toEqual([1, 2, 3]);
});

test('chunk', () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(() => chunk([1], 0)).toThrow('Chunk size must be positive');
});

test('last', () => {
  expect(last([1, 2, 3])).toBe(3);
  expect(last([])).toBeUndefined();
});

test('compact', () => {
  expect(compact([0, 1, false, 2, '', 3, null, undefined])).toEqual([1, 2, 3]);
});

test('range', () => {
  expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]);
  expect(range(0, 10, 3)).toEqual([0, 3, 6, 9]);
  expect(() => range(0, 5, -1)).toThrow('Step must be positive');
});
