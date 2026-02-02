/**
 * Bitwise operations tests
 */

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
import { bitwiseAnd, bitwiseOr, bitwiseXor, leftShift, rightShift } from '../../assembly-src/bitwise-utils';

test('bitwise AND', () => {
  expect(bitwiseAnd(0b1010, 0b1100)).toBe(0b1000);
  expect(bitwiseAnd(15, 7)).toBe(7);
});

test('bitwise OR', () => {
  expect(bitwiseOr(0b1010, 0b1100)).toBe(0b1110);
  expect(bitwiseOr(8, 4)).toBe(12);
});

test('bitwise XOR', () => {
  expect(bitwiseXor(0b1010, 0b1100)).toBe(0b0110);
  expect(bitwiseXor(15, 7)).toBe(8);
});

test('bit shifts', () => {
  expect(leftShift(1, 3)).toBe(8);
  expect(rightShift(16, 2)).toBe(4);
});
