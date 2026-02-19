import { test, describe, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import { retryTarget, retryHelper } from "../../assembly-src/coverage-collection-meta/retry-coverage.meta";
import { failsTarget } from "../../assembly-src/coverage-collection-meta/fails-coverage.meta";
import { coveredByNonSkip, onlyInSkipped } from "../../assembly-src/coverage-collection-meta/skip-coverage.meta";

// Exercises retry, fails, and skip coverage scenarios in a single test file.
// Each scenario uses its own source file so coverage is independently verifiable.

describe("retry coverage accumulation", () => {
  test("retried test accumulates coverage across attempts", TestOptions.retry(2), () => {
    retryTarget();
    retryHelper();
    // Always fails — triggers retry. With retry(2), this runs 3 times total.
    // Each attempt calls retryTarget and retryHelper once, so each should have 3 hits.
    expect(false).toBeTruthy();
  });
});

describe("fails test coverage", () => {
  test.fails("expected-failure test still collects coverage", () => {
    failsTarget();
    // Fails as expected — .fails modifier makes this test pass from vitest's perspective.
    // failsTarget should still have 1 hit from the execution before the assertion failure.
    expect(false).toBeTruthy();
  });
});

describe("skip coverage", () => {
  test("non-skipped test covers coveredByNonSkip", () => {
    expect(coveredByNonSkip()).toBe(42);
  });

  test.skip("skipped test would cover onlyInSkipped", () => {
    // This test is never executed — no WASM instance created.
    // onlyInSkipped should have 0 hits despite being imported.
    onlyInSkipped();
  });
});
