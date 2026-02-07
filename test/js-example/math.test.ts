import { test, describe, expect } from 'vitest';
import { add, subtract, multiply, divide } from '../js-example-src/math.js';

test('add function works [should fail] [for now]', { retry: 4 }, () => {
  expect(add(2, 3)).toBe(6);
  expect(add(-1, 1)).toBe(0);
  expect(add(0, 0)).toBe(0);
});

test('subtract function works', () => {
  expect(subtract(5, 3)).toBe(2);
  expect(subtract(0, 5)).toBe(-5);
});

test('multiply function works', () => {
  expect(multiply(2, 3)).toBe(6);
  expect(multiply(0, 5)).toBe(0);
  console.log();
});

describe('a suite!!', () => {
  test('divide function works', () => {
    expect(divide(6, 2)).toBe(3);
    expect(divide(5, 2)).toBe(2.5);
  });
  
  test('divide by zero throws error', () => {
    expect(() => divide(5, 0)).toThrow('divide by zero is not allowed');
  });
})
