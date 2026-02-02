/**
 * Utility function tests
 */

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
import { clamp, lerp, isEven, isOdd } from '../../assembly-src/utility-funcs';

test('clamp value', () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-5, 0, 10)).toBe(0);
  expect(clamp(15, 0, 10)).toBe(10);
});

test('lerp interpolation', () => {
  expect(lerp(0.0, 10.0, 0.5)).toBe(5.0);
  expect(lerp(0.0, 100.0, 0.25)).toBe(25.0);
});

test('isEven check', () => {
  expect(isEven(2)).toBeTruthy();
  expect(isEven(100)).toBeTruthy();
  expect(isEven(3)).toBeFalsey();
});

test('isOdd check', () => {
  expect(isOdd(1)).toBeTruthy();
  expect(isOdd(99)).toBeTruthy();
  expect(isOdd(4)).toBeFalsey();
});
