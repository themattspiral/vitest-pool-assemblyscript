import { test, describe, expect } from 'vitest';
import {
  forSum, whileCountdown, doAtLeastOnce, nestedLoops, neverLooped,
} from '../../js-coverage-parity-src/statement/loops.js';

// Parity twin for the AS loop fixtures: identical inputs to loops.meta.test.ts so
// v8's statement coverage is the comparison oracle for the AS coverage.
describe('loop statement parity twin', () => {
  test('forSum(4)', () => { expect(forSum(4)).toBe(6); });
  test('whileCountdown(3)', () => { expect(whileCountdown(3)).toBe(3); });
  test('doAtLeastOnce(2)', () => { expect(doAtLeastOnce(2)).toBe(2); });
  test('nestedLoops(2,3)', () => { expect(nestedLoops(2, 3)).toBe(6); });
  test('neverLooped(0)', () => { expect(neverLooped(0)).toBe(0); });
});
