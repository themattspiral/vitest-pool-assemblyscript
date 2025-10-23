/**
 * Loop tests
 */

import { test, assert } from '../../assembly';

test('for loop sum', () => {
  let sum = 0;
  for (let i = 1; i <= 100; i++) {
    sum += i;
  }
  assert(sum == 5050);
});

test('while loop countdown', () => {
  let count = 10;
  let iterations = 0;
  while (count > 0) {
    count--;
    iterations++;
  }
  assert(iterations == 10);
  assert(count == 0);
});

test('nested loops', () => {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      sum += i * j;
    }
  }
  assert(sum == 2025);
});
