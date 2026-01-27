/**
 * Flow control edge case tests
 * Exercises various control flow patterns: switch, loops, breaks, etc.
 */

import { test, expect } from '../../../assembly';
import {
  getCategory,
  classify,
  countDown,
  doCountUp,
  nestedLoops,
  findFirst,
  validateRange,
  getDayType,
  processMatrix,
  complexCondition,
  complexCondition2,
  ternaryLoop,
} from '../../assembly-src/flow-control-utils';

// Switch/case tests
test('getCategory returns correct values for switch cases', () => {
  const case0: i32 = getCategory(0);
  const case1: i32 = getCategory(1);
  const case2: i32 = getCategory(2);
  const caseDefault: i32 = getCategory(99);

  expect(case0).toBe(100);
  expect(case1).toBe(200);
  expect(case2).toBe(300);
  expect(caseDefault).toBe(-1);
});

// If/else if/else chain tests
test('classify returns correct category based on if/else chain', () => {
  const negative: i32 = classify(-5);
  const zero: i32 = classify(0);
  const small: i32 = classify(5);
  const large: i32 = classify(100);

  expect(negative).toBe(-1);
  expect(zero).toBe(0);
  expect(small).toBe(1);
  expect(large).toBe(2);
});

// While loop test
test('countDown uses while loop correctly', () => {
  const result: i32 = countDown(5);
  expect(result).toBe(5);

  const zeroStart: i32 = countDown(0);
  expect(zeroStart).toBe(0);
});

// Do-while loop test
test('doCountUp uses do-while loop correctly', () => {
  const result: i32 = doCountUp(5);
  // Sum of 0+1+2+3+4 = 10
  expect(result).toBe(10);

  const zeroLimit: i32 = doCountUp(0);
  // Do-while executes at least once: sum = 0
  expect(zeroLimit).toBe(0);
});

// Nested loops test
test('nestedLoops handles nested for loops', () => {
  const result: i32 = nestedLoops(3);
  // i*j for i,j in [0,1,2]: 0+0+0 + 0+1+2 + 0+2+4 = 9
  expect(result).toBe(9);

  const zeroN: i32 = nestedLoops(0);
  expect(zeroN).toBe(0);
});

// Break and continue test
test('findFirst uses break and continue correctly', () => {
  const arr: i32[] = [0, 1, 2, 3, 4, 5];

  const found: i32 = findFirst(arr, 3);
  expect(found).toBe(3);

  const notFound: i32 = findFirst(arr, 99);
  expect(notFound).toBe(-1);

  // Test that zeros are skipped (continue)
  const arrWithZeros: i32[] = [0, 0, 0, 5];
  const skipZeros: i32 = findFirst(arrWithZeros, 5);
  expect(skipZeros).toBe(3);
});

// Early return test
test('validateRange handles multiple early returns', () => {
  const tooSmall: i32 = validateRange(5, 10, 20);
  const tooLarge: i32 = validateRange(25, 10, 20);
  const inRange: i32 = validateRange(15, 10, 20);

  expect(tooSmall).toBe(-1);
  expect(tooLarge).toBe(1);
  expect(inRange).toBe(0);
});

// Switch with break (fall-through prevention) test
test('getDayType uses switch with break correctly', () => {
  const weekend1: i32 = getDayType(0);  // Sunday
  const weekend2: i32 = getDayType(6);  // Saturday
  const weekday: i32 = getDayType(3);   // Wednesday
  const invalid: i32 = getDayType(7);   // Invalid

  expect(weekend1).toBe(1);
  expect(weekend2).toBe(1);
  expect(weekday).toBe(2);
  expect(invalid).toBe(0);
});

// Nested conditionals inside loops test
test('processMatrix handles nested conditionals in loops', () => {
  const result: i32 = processMatrix(3);
  // For 3x3 matrix:
  // (0,0)=1, (0,1)=3, (0,2)=3
  // (1,0)=2, (1,1)=1, (1,2)=3
  // (2,0)=2, (2,1)=2, (2,2)=1
  // Total = 1+3+3+2+1+3+2+2+1 = 18
  expect(result).toBe(18);
});

// Complex boolean expressions test
test('complexCondition evaluates complex boolean expressions', () => {
  // (a > 0 && b > 0) || (c < 0 && a !== b)
  const bothPositive: bool = complexCondition(1, 1, 0);
  const negCAndDiff: bool = complexCondition(1, 2, -1);
  const neitherTrue: bool = complexCondition(-1, -1, 1);

  expect(bothPositive).toBe(true);
  expect(negCAndDiff).toBe(true);
  expect(neitherTrue).toBe(false);
});

// Complex boolean expressions test
test('complexCondition2 evaluates complex boolean expressions', () => {
  expect(complexCondition2(1, 1, 0, 6)).toBe(false);
  expect(complexCondition2(6, 1, 0, 4)).toBe(true);
  expect(complexCondition2(6, -1, 0, 4)).toBe(false);
  expect(complexCondition2(3, -1, 0, 4)).toBe(true);
  expect(complexCondition2(3, 3, 0, 4)).toBe(false);
  expect(complexCondition2(6, 3, 0, 2)).toBe(false);
  expect(complexCondition2(6, -1, 0, 2)).toBe(false);
  expect(complexCondition2(6, 3, 0, 1)).toBe(true);
  expect(complexCondition2(6, -1, 0, 1)).toBe(false);
  expect(complexCondition2(2, -1, 0, 1)).toBe(true);
});

test('ternaryLoop uses ternary operator in loop', () => {
  const result: i32 = ternaryLoop(4);
  expect(result).toBe(-2);

  const zeroN: i32 = ternaryLoop(0);
  expect(zeroN).toBe(0);
});
