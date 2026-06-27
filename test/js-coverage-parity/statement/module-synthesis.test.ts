import { test, describe, expect } from 'vitest';
import { ALWAYS_CONST, ALWAYS_LET, gate } from '../../js-coverage-parity-src/statement/module-synthesis.js';

// Parity twin: same structure + inputs so v8's coverage is the oracle for the AS
// synthesis decision (unconditional decls covered; the in-block const uncovered).
describe('module-declaration synthesis parity twin', () => {
  test('values', () => {
    expect(ALWAYS_CONST).toBe(10);
    expect(ALWAYS_LET).toBe(20);
    expect(gate()).toBe(false);
  });
});
