/**
 * Bitwise operations tests
 */

import { test, assert } from '../../assembly';
import { bitwiseAnd, bitwiseOr, bitwiseXor, leftShift, rightShift } from '../assembly-src/bitwise-utils';

test('bitwise AND', () => {
  assert(bitwiseAnd(0b1010, 0b1100) == 0b1000);
  assert(bitwiseAnd(15, 7) == 7);
});

test('bitwise OR', () => {
  assert(bitwiseOr(0b1010, 0b1100) == 0b1110);
  assert(bitwiseOr(8, 4) == 12);
});

test('bitwise XOR', () => {
  assert(bitwiseXor(0b1010, 0b1100) == 0b0110);
  assert(bitwiseXor(15, 7) == 8);
});

test('bit shifts', () => {
  assert(leftShift(1, 3) == 8);
  assert(rightShift(16, 2) == 4);
});
