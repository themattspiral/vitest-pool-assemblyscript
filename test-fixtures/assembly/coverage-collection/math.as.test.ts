/**
 * Math operations test suite
 * Tests basic arithmetic operations
 */

import { test, describe, expect } from '../../../assembly';
import { add, subtract, multiply, divide, addOneLiner, subtractOneLiner } from '../../assembly-src/math';

test("addition works [should fail]", () => {
  const sum: i32 = add(1, 1);

  console.assert(false, "this is a failed console assertion");
  expect(sum).toBe(3);
});

test("subtraction works", () => {
  console.error('This is subtraction in AS!');

  const diff: i32 = subtract(5, 3);
  expect(diff).toBe(2);
});

test("multiplication works", () => {
  console.log('This is multiplication in AS!');
  const product: i32 = multiply(2, 3);
  console.info('multiplication operation done.');
  expect(product).toBe(6);
  console.warn('multiplication assertion done.');
});

test("division works", () => {
  console.time();
  const quotient: i32 = divide(10, 2);
  console.timeLog();
  expect(quotient).toBe(5);
  console.timeEnd();
});

describe("one liners", () => {
  test("addition OL works - should merge coverage count for addOneLiner source with call from quick-tests.as.test.ts", () => {
    console.debug('This is one line addition');
    const sum: i32 = addOneLiner(1, 1);
    expect(sum).toBe(2);
  });

  test("subtraction OL works", () => {
    const diff: i32 = subtractOneLiner(5, 3);
    expect(diff).toBe(2);
  });
});
