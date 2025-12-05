/**
 * Tests for class-utils.ts
 *
 * Verifies that MethodDeclaration covers:
 * - Constructor
 * - Regular methods
 * - Getters
 * - Setters
 * - Static methods
 */

import { test, assert } from '../../assembly';
import { Counter } from '../assembly-src/class-utils';

// Test constructor
test('Counter constructor sets initial value', () => {
  const counter = new Counter(10);
  const value: i32 = counter.value;
  assert(value == 10, 'Initial value should be 10');
});

test('Counter constructor with default values', () => {
  const counter = new Counter();
  const value: i32 = counter.value;
  assert(value == 0, 'Default initial value should be 0');
});

test('Counter previewComplex shows hypothetical increased value', () => {
  const counter = new Counter(2);
  const preview = counter.previewComplex();
  assert(preview == 25, `Preview should be 43 when starting value is 2`);
});

test('Counter previewPlusTwo shows hypothetical increased value', () => {
  const counter = new Counter(8);
  const preview = counter.previewPlusTwo();
  assert(preview == 10, `Preview should be 10 when starting value is 8`);
});

test('Counter internalNesting shows hypothetical value', () => {
  const counter = new Counter();
  const preview = counter.internalNesting(2);
  assert(preview == 25, `internalNesting should be 25 when given value is 2`);
});

test('Counter increment increases value', () => {
  const counter = new Counter(5);
  counter.incrementInlined();
  const value: i32 = counter.value;
  assert(value == 6, 'Value should be 6 after increment');
});

test('Counter decrement decreases value', () => {
  const counter = new Counter(5);
  counter.decrement();
  const value: i32 = counter.value;
  assert(value == 4, 'Value should be 4 after decrement');
});

test('Counter add returns new value', () => {
  const counter = new Counter(10);
  const result: i32 = counter.add(5);
  assert(result == 15, 'Result should be 15');
});

// Test getters
test('Counter value getter returns current value', () => {
  const counter = new Counter(42);
  const value: i32 = counter.value;
  assert(value == 42, 'Getter should return 42');
});

test('Counter maxValue getter returns max', () => {
  const counter = new Counter(0, 50);
  const max: i32 = counter.maxValue;
  assert(max == 50, 'Max value should be 50');
});

// Test setters
test('Counter value setter updates value', () => {
  const counter = new Counter();
  counter.value = 25;
  const value: i32 = counter.value;
  assert(value == 25, 'Value should be 25 after setter');
});

test('Counter maxValue setter updates max', () => {
  const counter = new Counter(0, 100);
  counter.maxValue = 200;
  const max: i32 = counter.maxValue;
  assert(max == 200, 'Max should be 200 after setter');
});

// Test reset method
test('Counter reset sets value to 0', () => {
  const counter = new Counter(50);
  counter.reset();
  const value: i32 = counter.value;
  assert(value == 0, 'Value should be 0 after reset');
});

// Test static method
test('Counter.create static method works', () => {
  const counter = Counter.create(99);
  const value: i32 = counter.value;
  assert(value == 99, 'Static create should set initial value');
});

// Test private method (via public wrapper)
test('Counter getDoubled calls private doubleValue', () => {
  const counter = new Counter(5);
  const doubled: i32 = counter.getDoubled();
  assert(doubled == 10, 'Doubled value should be 10');
});

// Test boundary conditions
test('Counter increment respects maxValue', () => {
  const counter = new Counter(99, 100);
  counter.incrementInlined();
  const value: i32 = counter.value;
  assert(value == 100, 'Value should be 100');

  counter.incrementInlined(); // Should not exceed max
  const valueAfter: i32 = counter.value;
  assert(valueAfter == 100, 'Value should still be 100');
});

test('Counter decrement does not go below 0', () => {
  const counter = new Counter(1);
  counter.decrement();
  const value: i32 = counter.value;
  assert(value == 0, 'Value should be 0');

  counter.decrement(); // Should not go negative
  const valueAfter: i32 = counter.value;
  assert(valueAfter == 0, 'Value should still be 0');
});
