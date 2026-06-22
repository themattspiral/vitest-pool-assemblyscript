import { test, describe, expect } from 'vitest';
import {
  useI32, useF64,
} from '../../js-coverage-parity-src/statement/generics.js';

// Parity twin: identical inputs to generics.meta.test.ts. JS clamp is one function
// called twice — the v8 oracle for AS's SUM-across-monomorphizations.
describe('generic statement parity twin', () => {
  test('useI32', () => { expect(useI32()).toBe(5); });
  test('useF64', () => { expect(useF64()).toBe(10.0); });
});
