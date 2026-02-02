/**
 * Test file to validate @inline decorator behavior with coverage
 *
 * This file contains:
 * 1. Functions with @inline decorator
 * 2. Functions without @inline decorator
 * 3. Test that calls both types
 *
 * We want to verify:
 * - WITHOUT stripping: @inline functions missing from coverage
 * - WITH stripping: @inline functions appear in coverage
 */

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
import { addInlined, addNormal, multiplyWithInternalInlining, multiplyNormal, throwsError, callsInlinedAdd } from '../../assembly-src/inline-utils';

test('inline functions are called', (): void => {
  const sum1: i32 = addInlined(2, 3);
  expect(sum1).toBe(5);

  const sum2: i32 = addNormal(2, 3);
  expect(sum2).toBe(5);

  const prod1: i32 = multiplyWithInternalInlining(4, 5);
  expect(prod1).toBe(20);

  const prod2: i32 = multiplyNormal(4, 5);
  expect(prod2).toBe(20);
});

test('externally inlined function callsInlinedAdd', () => {
  const res: i32 = callsInlinedAdd(1, 2);
  expect(res).toBe(3);
});

test('inline function error source mapped to correct line [should fail]', (): void => {
  const wontAssign = throwsError(); // RUNTIME_ERROR@32:22 STACK_DEPTH:3 EXPECT_IN:inline-utils.ts:33:17 Out of bounds
});
