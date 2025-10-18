/**
 * Minimal test framework for validating Pool implementation
 * This file provides basic test() function that calls the imports
 * that our Pool expects.
 */

// WASM imports that Pool provides
@external("env", "__test_start")
declare function __test_start(namePtr: usize, nameLen: i32): void;

@external("env", "__test_pass")
declare function __test_pass(): void;

@external("env", "__test_fail")
declare function __test_fail(msgPtr: usize, msgLen: i32): void;

@external("env", "__assertion_pass")
declare function __assertion_pass(): void;

@external("env", "__assertion_fail")
declare function __assertion_fail(msgPtr: usize, msgLen: i32): void;

/**
 * Minimal test function (no try/catch - AS doesn't support exceptions yet)
 */
export function test(name: string, fn: () => void): void {
  // Notify pool that test started
  __test_start(changetype<usize>(name), name.length);

  // Execute test body
  fn();

  // If we get here, test passed
  __test_pass();
}

/**
 * Minimal assertion helper
 */
export function assert(condition: bool, message: string = "Assertion failed"): void {
  if (condition) {
    __assertion_pass();
  } else {
    __assertion_fail(changetype<usize>(message), message.length);
    // Abort on failure (AS way of handling failures)
    abort();
  }
}

// ===== TESTS =====
// Top-level test calls (transform will wrap these automatically)

// Static tests
test("static test 1", () => {
  // Workaround for AS const-folding bug: compute first, then compare
  const sum: i32 = 1 + 1;
  assert(sum == 2, "1 + 1 should equal 2");
  assert(true, "true should be true");
});

test("static test 2", () => {
  const product: i32 = 2 * 3;
  assert(product == 6, "2 * 3 should equal 6");
});

test("static test 3 - math", () => {
  const quotient: i32 = 10 / 2;
  assert(quotient == 5, "10 / 2 should equal 5");
  const square: i32 = 5 * 5;
  assert(square == 25, "5 * 5 should equal 25");
});

// Dynamic tests (can't use loop variables in closures - AS doesn't support closures)
test("dynamic test 0", () => {
  assert(0 >= 0, "0 should be >= 0");
});

test("dynamic test 1", () => {
  assert(1 >= 0, "1 should be >= 0");
});

test("dynamic test 2", () => {
  assert(2 >= 0, "2 should be >= 0");
});

// Conditional test
test("conditional test", () => {
  const ENABLE_FEATURE = true;
  assert(ENABLE_FEATURE, "feature should be enabled");
});

// Passing test with multiple assertions
test("multiple assertions", () => {
  assert(1 < 2, "1 < 2");
  assert(2 > 1, "2 > 1");
  assert(5 == 5, "5 == 5");
  assert(10 != 11, "10 != 11");
});
