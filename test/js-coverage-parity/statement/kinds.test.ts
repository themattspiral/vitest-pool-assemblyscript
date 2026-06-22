import { test, describe, expect } from 'vitest';
import {
  declarators, expressions, loopControl, maybeThrow,
} from '../../js-coverage-parity-src/statement/kinds.js';

// Parity twin: identical inputs to kinds.meta.test.ts so v8's statement coverage is
// the comparison oracle for the AS coverage.
describe('statement-kind parity twin', () => {
  test('declarators', () => { expect(declarators()).toBe(6); });
  test('expressions', () => { expect(expressions(5)).toBe(7); });
  test('loopControl(5)', () => { expect(loopControl(5)).toBe(2); });
  test('maybeThrow(5)', () => { expect(maybeThrow(5)).toBe(5); });
});
