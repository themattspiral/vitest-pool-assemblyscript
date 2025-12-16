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
  namedFuncMultiSpanLines,
  arrowFuncWithNesting,
  bracelessArrowFunc,
  arrowCallbackPassArrowFunc,
  callbackPassArrowFunc,
  arrowCallbackPassAnonFunc,
  callbackPassAnonFunc,
  arrowCallbackPassNamedFunc,
  callbackPassNamedFunc,
  declaredFuncWithNesting,
  callbackPassAnonFuncBraceless,
  arrowCallbackPassAnonFuncBraceless,
  constantReturn
} from '../assembly-src/function-utils';

test('arrowMulti adds 1', () => {
  const result: i32 = arrowMulti(5);
  assert(result == 6, 'arrowMulti(5) should be 6');
});

test('namedFuncMultiSpanLines function expression adds 1', () => {
  const result: i32 = namedFuncMultiSpanLines(10);
  assert(result == 11, 'd(10) should be 11');
});

test('arrowFuncWithNesting exercises nested functions', () => {
  const result: i32 = arrowFuncWithNesting(1);
  assert(result == 22, 'arrowFuncWithNesting(1) should be 22');
});

test('arrowFuncWithNesting with different input', () => {
  const result: i32 = arrowFuncWithNesting(0);
  assert(result == 19, 'arrowFuncWithNesting(0) should be 19');
});

test('declaredFuncWithNesting exercises nested functions', () => {
  const result: i32 = declaredFuncWithNesting(1);
  assert(result == 22, 'declaredFuncWithNesting(1) should be 22');
});

test('declaredFuncWithNesting with different input', () => {
  const result: i32 = declaredFuncWithNesting(0);
  assert(result == 19, 'declaredFuncWithNesting(0) should be 19');
});

test('bracelessArrowFunc doubles value+1', () => {
  const result: i32 = bracelessArrowFunc(7);
  assert(result == 16, 'bracelessArrowFunc(7) should be 16');
});

test('bracelessArrowFunc with zero', () => {
  const result: i32 = bracelessArrowFunc(0);
  assert(result == 2, 'bracelessArrowFunc(0) should be 2');
});

test('callbackPassNamedFunc uses basicAdd callback', () => {
  const result: i32 = callbackPassNamedFunc();
  assert(result == 4, 'callbackPassNamedFunc() should be 4');
});

test('callbackPassArrowFunc uses arrowFunc callback', () => {
  const result: i32 = callbackPassArrowFunc();
  assert(result == 26, 'callbackPassArrowFunc() should be 25');
});

test('callbackPassAnonFunc uses inline arrow callback', () => {
  const result: i32 = callbackPassAnonFunc();
  assert(result == 5, 'callbackPassAnonFunc() should be 5');
});

test('callbackPassAnonFuncBraceless uses braceless arrow callback', () => {
  const result: i32 = callbackPassAnonFuncBraceless();
  assert(result == 5, 'callbackPassAnonFuncBraceless() should be 5');
});

test('arrowCallbackPassNamedFunc uses basicAdd callback', () => {
  const result: i32 = arrowCallbackPassNamedFunc();
  assert(result == 4, 'arrowCallbackPassNamedFunc() should be 4');
});

test('arrowCallbackPassArrowFunc uses arrowFunc callback', () => {
  const result: i32 = arrowCallbackPassArrowFunc();
  assert(result == 26, 'arrowCallbackPassArrowFunc() should be 25');
});

test('arrowCallbackPassAnonFunc uses inline arrow callback', () => {
  const result: i32 = arrowCallbackPassAnonFunc();
  assert(result == 5, 'arrowCallbackPassAnonFunc() should be 5');
});

test('arrowCallbackPassAnonFuncBraceless uses inline arrow callback', () => {
  const result: i32 = arrowCallbackPassAnonFuncBraceless();
  assert(result == 5, 'arrowCallbackPassAnonFuncBraceless() should be 5');
});

test('constantReturn', () => {
  assert(constantReturn() == 1, 'constantReturn returns 1');
});
