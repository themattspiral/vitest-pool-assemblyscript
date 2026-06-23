import { test, describe, expect } from 'vitest';
import {
  andCheck, orCheck, ifAnd, ifOr, andChain,
} from '../../js-coverage-parity-src/branch/logical.js';

// Parity twin for the AS logical fixtures: identical inputs to logical.meta.test.ts
// so v8's branch coverage is the comparison oracle for the AS coverage.
describe('logical branch parity twin', () => {
  test('andCheck', () => {
    expect(andCheck(1, 1)).toBe(true);
    expect(andCheck(-1, 1)).toBe(false);
  });
  test('orCheck', () => {
    expect(orCheck(-1, 1)).toBe(true);
    expect(orCheck(1, 1)).toBe(true);
  });
  test('ifAnd', () => {
    expect(ifAnd(1, 1)).toBe(1);
    expect(ifAnd(1, -1)).toBe(0);
    expect(ifAnd(-1, 5)).toBe(0);
  });
  test('ifOr', () => {
    expect(ifOr(1, 1)).toBe(1);
    expect(ifOr(-1, 1)).toBe(1);
    expect(ifOr(-1, -1)).toBe(0);
  });
  test('andChain', () => {
    expect(andChain(1, 1, 1)).toBe(true);
    expect(andChain(1, -1, 1)).toBe(false);
    expect(andChain(-1, 1, 1)).toBe(false);
  });
});
