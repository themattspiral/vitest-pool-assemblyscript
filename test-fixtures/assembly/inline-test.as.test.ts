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

import { test, assert } from '../../assembly';
import { addInlined, addNormal, multiplyInlined, multiplyNormal, throwsError } from '../assembly-src/inline-utils';

test('inline functions are called', (): void => {
  const sum1: i32 = addInlined(2, 3);
  assert(sum1 == 5, 'inlined addition works');

  const sum2: i32 = addNormal(2, 3);
  assert(sum2 == 5, 'normal addition works');

  const prod1: i32 = multiplyInlined(4, 5);
  assert(prod1 == 20, 'inlined multiplication works');

  const prod2: i32 = multiplyNormal(4, 5);
  assert(prod2 == 20, 'normal multiplication works');
});

test('inline function error source mapped to correct line [should fail]', (): void => {
  const wontAssign = throwsError(); // RUNTIME_ERROR@32:22 STACK_DEPTH:3 EXPECT_IN:inline-utils.ts:33:17 Out of bounds
});
