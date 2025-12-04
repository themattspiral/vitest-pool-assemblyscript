/**
 * Tests for function-utils.ts
 *
 * Exercises various function declaration patterns:
 * - Arrow functions (with and without braces)
 * - Function expressions (named and anonymous)
 * - Nested functions at multiple levels
 * - Multi-declaration const statements
 * - Callback passing patterns
 */

import { test, assert } from '../../assembly';
import {
  arrowMulti,
  d,
  arrowFunc,
  bracelessArrowFunc,
  callbackPassNamedFunc,
  callbackPassArrowFunc,
  callbackPassAnonFunc,
} from '../assembly-src/function-utils';

// Test arrow function in multi-declaration const
test('arrowMulti adds 1', () => {
  const result: i32 = arrowMulti(5);
  assert(result == 6, 'arrowMulti(5) should be 6');
});

// Test function expression in multi-declaration const
test('d function expression adds 1', () => {
  const result: i32 = d(10);
  assert(result == 11, 'd(10) should be 11');
});

// Test arrow function with nested functions
test('arrowFunc exercises nested functions', () => {
  const result: i32 = arrowFunc(1);
  // arrowFunc has complex nesting:
  // - nestedBracelessArrow: 1 + 1 = 2
  // - nestedArrow: 2 + 2 = 4 (two double-nested calls each add 1)
  // - nestedNamedVar: 4 + 1 = 5
  // - nestedNamedFunc: 5 + 1 = 6 (via doubleNestedArrowInNamedFunc)
  // - nestedArrowMulti: 6 + 1 = 7
  // - nestedArrowMultiSpanLines: 7 + 1 = 8
  // - nestedNamedFuncMultiSpanLines: 8 + 1 = 9
  assert(result == 9, 'arrowFunc(1) should be 9');
});

test('arrowFunc with different input', () => {
  const result: i32 = arrowFunc(0);
  assert(result == 8, 'arrowFunc(0) should be 8');
});

// Test braceless arrow function
test('bracelessArrowFunc doubles value', () => {
  const result: i32 = bracelessArrowFunc(7);
  assert(result == 14, 'bracelessArrowFunc(7) should be 14');
});

test('bracelessArrowFunc with zero', () => {
  const result: i32 = bracelessArrowFunc(0);
  assert(result == 0, 'bracelessArrowFunc(0) should be 0');
});

// Test callback passing with named function
test('callbackPassNamedFunc uses basicAdd callback', () => {
  const result: i32 = callbackPassNamedFunc();
  // namedFuncWithCallbackArg(2, basicAdd) = basicAdd(2) + 1 = 3 + 1 = 4
  assert(result == 4, 'callbackPassNamedFunc() should be 4');
});

// Test callback passing with arrow function
test('callbackPassArrowFunc uses arrowFunc callback', () => {
  const result: i32 = callbackPassArrowFunc();
  // namedFuncWithCallbackArg(2, arrowFunc) = arrowFunc(2) + 1 = 10 + 1 = 11
  assert(result == 11, 'callbackPassArrowFunc() should be 11');
});

// Test callback passing with anonymous function
test('callbackPassAnonFunc uses inline arrow callback', () => {
  const result: i32 = callbackPassAnonFunc();
  // namedFuncWithCallbackArg(3, (a) => a + 1) = (3 + 1) + 1 = 5
  assert(result == 5, 'callbackPassAnonFunc() should be 5');
});
