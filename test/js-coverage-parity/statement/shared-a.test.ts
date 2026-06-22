import { test, describe, expect } from 'vitest';
import { pick } from '../../js-coverage-parity-src/statement/shared.js';

// Parity twin file A: covers the then-arm (shared-b covers the else-arm).
describe('shared statement parity twin (file A)', () => {
  test('pick(true)', () => { expect(pick(true)).toBe(1); });
});
