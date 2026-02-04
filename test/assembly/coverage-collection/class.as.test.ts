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

import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { Counter } from "../../assembly-src/class-utils";
import {
  useCounter,
  useCounterWithIfBlock,
  useCounterWithSwitchBlock,
  useCounterWithIfBlockWithForeignExpression,
  useCounterWithIfBlockWithConstantCondition
} from "../../assembly-src/class-consumer";

// Test constructor
test("Counter constructor sets initial value", () => {
  const counter = new Counter(11);
  const value: i32 = counter.value;
  expect(value).toBe(11);
});

test("Counter constructor with default values", () => {
  const counter = new Counter();
  const value: i32 = counter.value;
  expect(value).toBe(0);
});

test("Counter previewComplex shows hypothetical increased value", () => {
  const counter = new Counter(2);
  const preview = counter.previewComplex();
  expect(preview).toBe(25);
});

test("Counter previewPlusTwo shows hypothetical increased value", () => {
  const counter = new Counter(8);
  const preview = counter.previewPlusTwo();
  expect(preview).toBe(10);
});

test("Counter internalNesting shows hypothetical value", () => {
  const counter = new Counter();
  const preview = counter.internalNesting(2);
  expect(preview).toBe(25);
});

test("Counter increment increases value", () => {
  const counter = new Counter(5);
  counter.incrementInlined();
  const value: i32 = counter.value;
  expect(value).toBe(6);
});

test("Counter decrement decreases value", () => {
  const counter = new Counter(5);
  counter.decrement();
  const value: i32 = counter.value;
  expect(value).toBe(4);
});

test("Counter add returns new value", () => {
  const counter = new Counter(10);
  const result: i32 = counter.add(5);
  expect(result).toBe(15);
});

// Test getters
test("Counter value getter returns current value", () => {
  const counter = new Counter(42);
  const value: i32 = counter.value;
  expect(value).toBe(42);
});

test("Counter maxValue getter returns max", () => {
  const counter = new Counter(0, 50);
  const max: i32 = counter.maxValue;
  expect(max).toBe(50);
});

// Test setters
test("Counter value setter updates value", () => {
  const counter = new Counter();
  counter.value = 25;
  const value: i32 = counter.value;
  expect(value).toBe(25);
});

test("Counter maxValue setter updates max", () => {
  const counter = new Counter(0, 100);
  counter.maxValue = 200;
  const max: i32 = counter.maxValue;
  expect(max).toBe(200);
});

// Test reset method
test("Counter reset sets value to 0", () => {
  const counter = new Counter(50);
  counter.reset();
  const value: i32 = counter.value;
  expect(value).toBe(0);
});

// Test static method
test("Counter.create static method works", () => {
  const counter = Counter.create(99);
  const value: i32 = counter.value;
  expect(value).toBe(99);
});

// Test private method (via public wrapper)
test("Counter getDoubled calls private doubleValue", () => {
  const counter = new Counter(5);
  const doubled: i32 = counter.getDoubled();
  expect(doubled).toBe(10);
});

// Test boundary conditions
test("Counter increment respects maxValue", () => {
  const counter = new Counter(99, 100);
  counter.incrementInlined();
  const value: i32 = counter.value;
  expect(value).toBe(100);

  counter.incrementInlined(); // Should not exceed max
  const valueAfter: i32 = counter.value;
  expect(valueAfter).toBe(100);
});

test("Counter decrement does not go below 0", () => {
  const counter = new Counter(1);
  counter.decrement();
  const value: i32 = counter.value;
  expect(value).toBe(0);

  counter.decrement(); // Should not go negative
  const valueAfter: i32 = counter.value;
  expect(valueAfter).toBe(0);
});

test("Counter is instantiated from a another source file", () => {
  const val = useCounter();
  expect(val).toBe(0);
});

test("IF BLOCK Counter is instantiated from a another source file", () => {
  const val = useCounterWithIfBlock(0);
  expect(val).toBe(0);
});

test("SWITCH BLOCK Counter is instantiated from a another source file", () => {
  const val = useCounterWithSwitchBlock(2);
  expect(val).toBe(1);
});

test("IF BLOCK (foreign expression) Counter is instantiated from a another source file", () => {
  const val = useCounterWithIfBlockWithForeignExpression(0);
  expect(val).toBe(2);
});

test("IF BLOCKS NESTED (constant conditions)", () => {
  const val = useCounterWithIfBlockWithConstantCondition();
  expect(val).toBe(3);
});
