/**
 * Flow control edge case tests
 * Exercises various control flow patterns: switch, loops, breaks, etc.
 */

import { test, assert } from '../../assembly';
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
} from '../assembly-src/flow-control-utils';

// Switch/case tests
test('getCategory returns correct values for switch cases', () => {
  const case0: i32 = getCategory(0);
  const case1: i32 = getCategory(1);
  const case2: i32 = getCategory(2);
  const caseDefault: i32 = getCategory(99);

  assert(case0 == 100, 'case 0 should return 100');
  assert(case1 == 200, 'case 1 should return 200');
  assert(case2 == 300, 'case 2 should return 300');
  assert(caseDefault == -1, 'default case should return -1');
});

// If/else if/else chain tests
test('classify returns correct category based on if/else chain', () => {
  const negative: i32 = classify(-5);
  const zero: i32 = classify(0);
  const small: i32 = classify(5);
  const large: i32 = classify(100);

  assert(negative == -1, 'negative numbers should return -1');
  assert(zero == 0, 'zero should return 0');
  assert(small == 1, 'small positive (< 10) should return 1');
  assert(large == 2, 'large positive (>= 10) should return 2');
});

// While loop test
test('countDown uses while loop correctly', () => {
  const result: i32 = countDown(5);
  assert(result == 5, 'counting down from 5 should return 5');

  const zeroStart: i32 = countDown(0);
  assert(zeroStart == 0, 'counting down from 0 should return 0');
});

// Do-while loop test
test('doCountUp uses do-while loop correctly', () => {
  const result: i32 = doCountUp(5);
  // Sum of 0+1+2+3+4 = 10
  assert(result == 10, 'sum from 0 to 4 should be 10');

  const zeroLimit: i32 = doCountUp(0);
  // Do-while executes at least once: sum = 0
  assert(zeroLimit == 0, 'do-while with limit 0 should return 0');
});

// Nested loops test
test('nestedLoops handles nested for loops', () => {
  const result: i32 = nestedLoops(3);
  // i*j for i,j in [0,1,2]: 0+0+0 + 0+1+2 + 0+2+4 = 9
  assert(result == 9, 'nested loops with n=3 should return 9');

  const zeroN: i32 = nestedLoops(0);
  assert(zeroN == 0, 'nested loops with n=0 should return 0');
});

// Break and continue test
test('findFirst uses break and continue correctly', () => {
  const arr: i32[] = [0, 1, 2, 3, 4, 5];

  const found: i32 = findFirst(arr, 3);
  assert(found == 3, 'should find 3 at index 3');

  const notFound: i32 = findFirst(arr, 99);
  assert(notFound == -1, 'should return -1 when not found');

  // Test that zeros are skipped (continue)
  const arrWithZeros: i32[] = [0, 0, 0, 5];
  const skipZeros: i32 = findFirst(arrWithZeros, 5);
  assert(skipZeros == 3, 'should skip zeros and find 5 at index 3');
});

// Early return test
test('validateRange handles multiple early returns', () => {
  const tooSmall: i32 = validateRange(5, 10, 20);
  const tooLarge: i32 = validateRange(25, 10, 20);
  const inRange: i32 = validateRange(15, 10, 20);

  assert(tooSmall == -1, 'value below min should return -1');
  assert(tooLarge == 1, 'value above max should return 1');
  assert(inRange == 0, 'value in range should return 0');
});

// Switch with break (fall-through prevention) test
test('getDayType uses switch with break correctly', () => {
  const weekend1: i32 = getDayType(0);  // Sunday
  const weekend2: i32 = getDayType(6);  // Saturday
  const weekday: i32 = getDayType(3);   // Wednesday
  const invalid: i32 = getDayType(7);   // Invalid

  assert(weekend1 == 1, 'Sunday should be weekend (1)');
  assert(weekend2 == 1, 'Saturday should be weekend (1)');
  assert(weekday == 2, 'Wednesday should be weekday (2)');
  assert(invalid == 0, 'invalid day should return 0');
});

// Nested conditionals inside loops test
test('processMatrix handles nested conditionals in loops', () => {
  const result: i32 = processMatrix(3);
  // For 3x3 matrix:
  // (0,0)=1, (0,1)=3, (0,2)=3
  // (1,0)=2, (1,1)=1, (1,2)=3
  // (2,0)=2, (2,1)=2, (2,2)=1
  // Total = 1+3+3+2+1+3+2+2+1 = 18
  assert(result == 18, 'processMatrix(3) should return 18');
});

// Complex boolean expressions test
test('complexCondition evaluates complex boolean expressions', () => {
  // (a > 0 && b > 0) || (c < 0 && a !== b)
  const bothPositive: bool = complexCondition(1, 1, 0);
  const negCAndDiff: bool = complexCondition(1, 2, -1);
  const neitherTrue: bool = complexCondition(-1, -1, 1);

  assert(bothPositive == true, 'both positive should be true');
  assert(negCAndDiff == true, 'negative c with different a,b should be true');
  assert(neitherTrue == false, 'neither condition met should be false');
});

// Complex boolean expressions test
test('complexCondition evaluates complex boolean expressions', () => {
  const bothPositive: bool = complexCondition2(1, 1, 0, 1);
  const negCAndDiff: bool = complexCondition2(1, 2, -1, 2);
  const neitherTrue: bool = complexCondition2(-1, -1, 1, 6);

  assert(bothPositive == true, 'both positive should be true');
  assert(negCAndDiff == true, 'negative c with different a,b should be true');
  assert(neitherTrue == false, 'neither condition met should be false');
});

// Ternary in loop test
test('ternaryLoop uses ternary operator in loop', () => {
  const result: i32 = ternaryLoop(4);
  // i=0: +0, i=1: -1, i=2: +2, i=3: -3
  // Total = 0 - 1 + 2 - 3 = -2
  assert(result == -2, 'ternaryLoop(4) should return -2');

  const zeroN: i32 = ternaryLoop(0);
  assert(zeroN == 0, 'ternaryLoop(0) should return 0');
});
