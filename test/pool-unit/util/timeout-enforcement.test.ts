import { describe, test, expect } from 'vitest';

import { isTimeoutEnforced } from '../../../src/util/vitest-tasks.js';

// A timeout of `<= 0` or `Infinity` both mean "no timeout" rather than an 
// already-expired deadline. The AS-facing cases (a per-test or per-hook `0`)
// are covered end-to-end by test/assembly/runner-behavior/timeout-disabled.test.ts;
// `Infinity` can only arrive from vitest config, since the AssemblyScript-side timeout 
// is an i32.

describe('isTimeoutEnforced', () => {
  test('enforces ordinary positive timeouts', () => {
    expect(isTimeoutEnforced(1)).toBe(true);
    expect(isTimeoutEnforced(500)).toBe(true);
    expect(isTimeoutEnforced(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  test('does not enforce a zero timeout', () => {
    expect(isTimeoutEnforced(0)).toBe(false);
  });

  test('does not enforce a negative timeout', () => {
    expect(isTimeoutEnforced(-1)).toBe(false);
  });

  test('does not enforce an infinite timeout', () => {
    expect(isTimeoutEnforced(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
