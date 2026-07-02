import { test, describe, expect } from 'vitest';
import { pick } from '../../js-coverage-parity-src/statement/shared.js';

// Parity twin file B: covers the else-arm (shared-a covers the then-arm).
describe('shared statement parity twin (file B)', () => {
  test('pick(false)', () => { expect(pick(false)).toBe(2); });
});
