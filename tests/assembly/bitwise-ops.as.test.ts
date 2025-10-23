/**
 * Bitwise operations tests
 */

import { test, assert } from '../../assembly';

test('bitwise AND', () => {
  assert((0b1010 & 0b1100) == 0b1000);
  assert((15 & 7) == 7);
});

test('bitwise OR', () => {
  assert((0b1010 | 0b1100) == 0b1110);
  assert((8 | 4) == 12);
});

test('bitwise XOR', () => {
  assert((0b1010 ^ 0b1100) == 0b0110);
  assert((15 ^ 7) == 8);
});

test('bit shifts', () => {
  assert((1 << 3) == 8);
  assert((16 >> 2) == 4);
});
