import { test, describe, expect } from 'vitest';
import {
  classify, earlyReturn, guarded,
} from '../../js-coverage-parity-src/statement/reachability.js';

// Parity twin: identical inputs to reachability.meta.test.ts so v8's statement
// coverage is the comparison oracle for the AS coverage.
describe('reachability statement parity twin', () => {
  test('classify both arms', () => {
    expect(classify(5)).toBe(1);
    expect(classify(-5)).toBe(-1);
  });
  test('earlyReturn(5)', () => { expect(earlyReturn(5)).toBe(10); });
  test('guarded(true)', () => { expect(guarded(true)).toBe(10); });
});
