/**
 * Math operations test suite
 * Tests basic arithmetic operations
 */

import { test, assert } from '../../assembly';
import { add, subtract, multiply, divide } from '../assembly-src/math';

test("addition works", () => {
  const sum: i32 = add(1, 1);
  assert(sum == 2, "1 + 1 should equal 2");
});

test("subtraction works", () => {
  const diff: i32 = subtract(5, 3);
  assert(diff == 2, "5 - 3 should equal 2");
});

test("multiplication works", () => {
  const product: i32 = multiply(2, 3);
  assert(product == 6, "2 * 3 should equal 6");
});

test("division works", () => {
  const quotient: i32 = divide(10, 2);
  assert(quotient == 5, "10 / 2 should equal 5");
});
