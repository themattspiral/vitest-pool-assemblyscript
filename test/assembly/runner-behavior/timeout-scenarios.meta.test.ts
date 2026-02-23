import { test, describe, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { infiniteLoop, simpleFunc } from "../../assembly-src/timeout-scenarios.meta";
import { add } from "../../assembly-src/quick-math";

// Pre-timeout tests in different states to verify resume integrity:
// completed results must be preserved exactly, not modified or re-executed.

test("pre-timeout passing test", () => {
  expect(simpleFunc()).toBe(42);
});

test("pre-timeout failing test [should fail]", () => {
  expect(add(1, 2)).toBe(99);
});

test.skip("pre-timeout skipped test", () => {
  expect(simpleFunc()).toBe(42);
});

// --- Timeout scenarios ---

test("simple timeout [should fail]", TestOptions.timeout(100), () => {
  infiniteLoop();
});

test("timeout with retry [should fail]", TestOptions.timeout(100).retry(2), () => {
  infiniteLoop();
});

test("timeout with fails modifier", TestOptions.timeout(100).fails(), () => {
  infiniteLoop();
});

describe("suite with inherited timeout", TestOptions.timeout(100), () => {
  test("inherits suite timeout [should fail]", () => {
    infiniteLoop();
  });
});

test("timeout with different value [should fail]", TestOptions.timeout(250), () => {
  infiniteLoop();
});

// Post-timeout tests to verify resume works correctly.

test("post-timeout passing test", () => {
  expect(simpleFunc()).toBe(42);
});

test("post-timeout failing test [should fail]", () => {
  expect(add(1, 2)).toBe(99);
});
