import { test, describe, expect, TestOptions } from "vitest-pool-assemblyscript/assembly";
import {
  completedSiblingFunc, nestedBeforeFunc,
  beforeTimeout, duringTimeout, afterTimeout,
  nestedAfterFunc
} from "../../assembly-src/coverage-collection-meta/timeout-coverage.meta";

// Timeout coverage preservation with nested suite structure.
// Tests run sequentially within a file, so ordering is deterministic.
//
// Structure verifies coverage preservation across:
//   - Completed sibling suite (coverage merged into parent before timeout)
//   - Completed nested subsuite before the timeout test
//   - Tests in the same suite as the timeout (before and after)
//   - Nested subsuite that runs after timeout resume

describe("completed sibling suite", () => {
  test("calls completedSiblingFunc", () => {
    expect(completedSiblingFunc()).toBe(10);
  });
});

describe("parent of timeout", () => {
  describe("nested suite before timeout", () => {
    test("calls nestedBeforeFunc", () => {
      expect(nestedBeforeFunc()).toBe(20);
    });
  });

  test("before timeout", () => {
    expect(beforeTimeout()).toBe(1);
  });

  test("deliberately times out [should fail]", TestOptions.timeout(100), () => {
    duringTimeout();
    // Infinite loop to trigger timeout — coverage from this test is lost
    // because the thread is killed before coverage memory is read
    while (true) {}
  });

  test("after timeout resume", () => {
    expect(afterTimeout()).toBe(3);
  });

  describe("nested suite after timeout", () => {
    test("calls nestedAfterFunc", () => {
      expect(nestedAfterFunc()).toBe(30);
    });
  });
});
