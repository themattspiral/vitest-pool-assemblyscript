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

import { test, assert } from '../../assembly/index';

// Helper function WITH @inline decorator
// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
function addInlined(a: i32, b: i32): i32 {
  return a + b;
}

// Helper function WITHOUT @inline decorator
function addNormal(a: i32, b: i32): i32 {
  return a + b;
}

// Another @inline function
// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
function multiplyInlined(a: i32, b: i32): i32 {
  return a * b;
}

// Another normal function
function multiplyNormal(a: i32, b: i32): i32 {
  return a * b;
}

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

// Test with error inside @inline function to validate source map accuracy
// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
function throwsError(shouldFail: boolean): i32 {
  if (shouldFail) {
    assert(false, 'error inside inline function at AS source line 59...');
  }
  return 42;
}

test('error inside inline function shows correct line', (): void => {
  throwsError(true);
});
