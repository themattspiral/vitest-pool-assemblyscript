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

import { test, expect } from 'vitest-pool-assemblyscript/assembly';
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
} from '../../assembly-src/function-utils';

test('arrowMulti adds 1', () => {
  const result: i32 = arrowMulti(5);
  expect(result).toBe(6);
});

test('namedFuncMultiSpanLines function expression adds 1', () => {
  const result: i32 = namedFuncMultiSpanLines(10);
  expect(result).toBe(11);
});

test('arrowFuncWithNesting exercises nested functions', () => {
  const result: i32 = arrowFuncWithNesting(1);
  expect(result).toBe(22);
});

test('arrowFuncWithNesting with different input', () => {
  const result: i32 = arrowFuncWithNesting(0);
  expect(result).toBe(19);
});

test('declaredFuncWithNesting exercises nested functions', () => {
  const result: i32 = declaredFuncWithNesting(1);
  expect(result).toBe(22);
});

test('declaredFuncWithNesting with different input', () => {
  const result: i32 = declaredFuncWithNesting(0);
  expect(result).toBe(19);
});

test('bracelessArrowFunc doubles value+1', () => {
  const result: i32 = bracelessArrowFunc(7);
  expect(result).toBe(16);
});

test('bracelessArrowFunc with zero', () => {
  const result: i32 = bracelessArrowFunc(0);
  expect(result).toBe(2);
});

test('callbackPassNamedFunc uses basicAdd callback', () => {
  const result: i32 = callbackPassNamedFunc();
  expect(result).toBe(4);
});

test('callbackPassArrowFunc uses arrowFunc callback', () => {
  const result: i32 = callbackPassArrowFunc();
  expect(result).toBe(26);
});

test('callbackPassAnonFunc uses inline arrow callback', () => {
  const result: i32 = callbackPassAnonFunc();
  expect(result).toBe(5);
});

test('callbackPassAnonFuncBraceless uses braceless arrow callback', () => {
  const result: i32 = callbackPassAnonFuncBraceless();
  expect(result).toBe(5);
});

test('arrowCallbackPassNamedFunc uses basicAdd callback', () => {
  const result: i32 = arrowCallbackPassNamedFunc();
  expect(result).toBe(4);
});

test('arrowCallbackPassArrowFunc uses arrowFunc callback', () => {
  const result: i32 = arrowCallbackPassArrowFunc();
  expect(result).toBe(26);
});

test('arrowCallbackPassAnonFunc uses inline arrow callback', () => {
  const result: i32 = arrowCallbackPassAnonFunc();
  expect(result).toBe(5);
});

test('arrowCallbackPassAnonFuncBraceless uses inline arrow callback', () => {
  const result: i32 = arrowCallbackPassAnonFuncBraceless();
  expect(result).toBe(5);
});

test('constantReturn', () => {
  expect(constantReturn()).toBe(1);
});
