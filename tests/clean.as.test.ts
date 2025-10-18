/**
 * Clean test file with ZERO exports
 * Tests the transform's ability to wrap top-level code
 * This file imports the framework and uses it, but exports nothing
 */

import { test, assert } from './framework';

// ===== TESTS =====
// Top-level test calls with NO exports in this file

test("addition works", () => {
  const sum: i32 = 1 + 1;
  assert(sum == 2, "1 + 1 should equal 2");
});

test("subtraction works", () => {
  const diff: i32 = 5 - 3;
  assert(diff == 2, "5 - 3 should equal 2");
});

test("multiplication works", () => {
  const product: i32 = 2 * 3;
  assert(product == 6, "2 * 3 should equal 6");
});

test("division works", () => {
  const quotient: i32 = 10 / 2;
  assert(quotient == 5, "10 / 2 should equal 5");
});

test("comparisons work", () => {
  assert(1 < 2, "1 < 2");
  assert(2 > 1, "2 > 1");
  assert(5 == 5, "5 == 5");
  assert(10 != 11, "10 != 11");
});

test("boolean logic", () => {
  assert(true, "true is true");
  assert(!false, "!false is true");
  assert(true && true, "true && true");
  assert(true || false, "true || false");
});
