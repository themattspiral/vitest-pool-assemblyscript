import { expect } from "vitest-pool-assemblyscript/assembly";

export function testHelperWithFailingAssertion(): void {
  expect(1).toBe(2);
}

export function testHelperWithRuntimeAbort(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}

export function testHelperWithStackOverflowCrash(num: i32, str: string): string {
  // infinite recursion - will overflow, crash runtime, and get caught by executor
  return testHelperWithStackOverflowCrash(num + 1, str) + str;
}
