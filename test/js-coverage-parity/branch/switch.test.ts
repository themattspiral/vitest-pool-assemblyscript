import { test, describe, expect } from 'vitest';
import {
  category, dayType, classifySign, firstOnly, emptyTrailing,
  cumulative, signBucket, colorName, grid, midDefault,
} from '../../js-coverage-parity-src/branch/switch.js';

// Parity twin for the AS switch fixtures: identical inputs to switch.meta.test.ts
// so v8's switch branch coverage is the comparison oracle for the AS coverage.
describe('switch branch parity twin', () => {
  test('category', () => {
    expect(category(1)).toBe(10);
    expect(category(99)).toBe(-1);
  });
  test('dayType', () => {
    expect(dayType(0)).toBe(1);
    expect(dayType(2)).toBe(2);
    expect(dayType(9)).toBe(0);
  });
  test('classifySign', () => {
    expect(classifySign(0)).toBe(10);
    expect(classifySign(5)).toBe(0);
  });
  test('firstOnly', () => {
    expect(firstOnly(0)).toBe(-1);
    expect(firstOnly(5)).toBe(99);
  });
  test('emptyTrailing', () => {
    expect(emptyTrailing(1)).toBe(10);
    expect(emptyTrailing(2)).toBe(99);
    expect(emptyTrailing(5)).toBe(99);
  });
  test('cumulative', () => {
    expect(cumulative(1)).toBe(7);
    expect(cumulative(2)).toBe(6);
    expect(cumulative(5)).toBe(4);
  });
  test('signBucket', () => {
    expect(signBucket(-5)).toBe(1);
    expect(signBucket(1000)).toBe(2);
    expect(signBucket(0)).toBe(0);
  });
  test('colorName', () => {
    expect(colorName(0)).toBe(1);
    expect(colorName(2)).toBe(3);
  });
  test('grid', () => {
    expect(grid(0, 0)).toBe(1);
    expect(grid(0, 5)).toBe(2);
    expect(grid(9, 0)).toBe(3);
  });
  test('midDefault', () => {
    expect(midDefault(1)).toBe(1);
    expect(midDefault(5)).toBe(0);
  });
});
