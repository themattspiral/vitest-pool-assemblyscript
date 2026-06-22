import { test, describe, expect } from 'vitest';
import {
  multiLine, packed,
} from '../../js-coverage-parity-src/statement/layout.js';

// Parity twin: identical inputs to layout.meta.test.ts (unusedPath never called) so
// v8's statement/line coverage is the comparison oracle for the AS coverage.
describe('statement layout parity twin', () => {
  test('multiLine(3,4)', () => { expect(multiLine(3, 4)).toBe(7); });
  test('packed(5)', () => { expect(packed(5)).toBe(14); });
});
