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
  // Trace with a=1:
  // 1. nestedBracelessArrow(1) = 1 + 1 = 2
  // 2. nestedArrow(2) = 2*2 + 2 = 6  (res1=b+1, res2=b+1, return res1+res2)
  // 3. nestedNamedVar(6) = 6 + 1 = 7
  // 4. nestedNamedFunc(7) = 7 + 1 = 8
  // 5. nestedArrowMulti(8) = 8 + 1 = 9 (thing1)
  // 6. nestedArrowMultiSpanLines(9) = 9 + 1 = 10
  // 7. nestedNamedFuncMultiSpanLines(10) = 10 + 1 = 11
  assert(result == 11, 'arrowFunc(1) should be 11');
});

test('arrowFunc with different input', () => {
  const result: i32 = arrowFunc(0);
  // Trace with a=0:
  // 1. nestedBracelessArrow(0) = 0 + 1 = 1
  // 2. nestedArrow(1) = 2*1 + 2 = 4
  // 3. nestedNamedVar(4) = 4 + 1 = 5
  // 4. nestedNamedFunc(5) = 5 + 1 = 6
  // 5. nestedArrowMulti(6) = 6 + 1 = 7 (thing1)
  // 6. nestedArrowMultiSpanLines(7) = 7 + 1 = 8
  // 7. nestedNamedFuncMultiSpanLines(8) = 8 + 1 = 9
  assert(result == 9, 'arrowFunc(0) should be 9');
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
  // namedFuncWithCallbackArg(2, arrowFunc) = arrowFunc(2) + 1 = 13 + 1 = 14
  // arrowFunc(2) trace: 3 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13
  assert(result == 14, 'callbackPassArrowFunc() should be 14');
});

// Test callback passing with anonymous function
test('callbackPassAnonFunc uses inline arrow callback', () => {
  const result: i32 = callbackPassAnonFunc();
  // namedFuncWithCallbackArg(3, (a) => a + 1) = (3 + 1) + 1 = 5
  assert(result == 5, 'callbackPassAnonFunc() should be 5');
});
