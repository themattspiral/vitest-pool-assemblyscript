import { test, describe, expect } from 'vitest';
import { TABLE_SIZE, MAX_RETRIES, ENABLED } from '../../js-coverage-parity-src/statement/module-consts.js';

// Parity twin: imports + uses the same constants so v8's coverage of the const-only
// module is the comparison oracle for the AS coverage.
describe('const-only module parity twin', () => {
  test('constants usable', () => {
    expect(TABLE_SIZE).toBe(1024);
    expect(MAX_RETRIES).toBe(3);
    expect(ENABLED).toBe(true);
  });
});
