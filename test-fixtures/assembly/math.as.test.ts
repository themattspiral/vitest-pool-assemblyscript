/**
 * Math operations test suite
 * Tests basic arithmetic operations
 */

import { test, assert, assertEqual } from '../../assembly';
import { add, subtract, multiply, divide, addOneLiner, subtractOneLiner } from '../assembly-src/math';
// import { subtract, multiply, divide, addOneLiner, subtractOneLiner } from '../assembly-src/math';
// import { addOneLiner, subtractOneLiner } from '../assembly-src/math';

test("addition works [should fail]", () => {
  const sum: i32 = add(1, 1);

  console.assert(false, "this is a failed console assertion");
  assertEqual(sum, 3, "1 + 1 should equal 3");
});

test("subtraction works", () => {
  console.error('This is subtraction in AS!');

  const diff: i32 = subtract(5, 3);
  assert(diff == 2, "5 - 3 should equal 2");
});

test("multiplication works", () => {
  console.log('This is multiplication in AS!');
  const product: i32 = multiply(2, 3);
  console.info('multiplication operation done.');
  assert(product == 6, "2 * 3 should equal 6");
  console.warn('multiplication assertion done.');
});

test("division works", () => {
  console.time();
  const quotient: i32 = divide(10, 2);
  console.timeLog();
  assert(quotient == 5, "10 / 2 should equal 5");
  console.timeEnd();
});

test("addition OL works - should merge coverage count for addOneLiner source with call from quick-tests.as.test.ts", () => {
  console.debug('This is one line addition');
  const sum: i32 = addOneLiner(1, 1);
  assert(sum == 2, "1 + 1 should equal 2");
});

test("subtraction OL works", () => {
  const diff: i32 = subtractOneLiner(5, 3);
  assert(diff == 2, "5 - 3 should equal 2");
});
