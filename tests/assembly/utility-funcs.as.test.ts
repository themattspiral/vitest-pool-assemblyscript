/**
 * Utility function tests
 */

import { test, assert } from '../../assembly';

function clamp(value: i32, min: i32, max: i32): i32 {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function lerp(a: f32, b: f32, t: f32): f32 {
  return a + (b - a) * t;
}

function isEven(n: i32): bool {
  return n % 2 == 0;
}

function isOdd(n: i32): bool {
  return n % 2 != 0;
}

test('clamp value', () => {
  assert(clamp(5, 0, 10) == 5);
  assert(clamp(-5, 0, 10) == 0);
  assert(clamp(15, 0, 10) == 10);
});

test('lerp interpolation', () => {
  assert(lerp(0.0, 10.0, 0.5) == 5.0);
  assert(lerp(0.0, 100.0, 0.25) == 25.0);
});

test('isEven check', () => {
  assert(isEven(2));
  assert(isEven(100));
  assert(!isEven(3));
});

test('isOdd check', () => {
  assert(isOdd(1));
  assert(isOdd(99));
  assert(!isOdd(4));
});
