/**
 * Minimal test framework - framework implementation only
 * This file provides the test() and assert() functions
 * No tests in this file - just the framework exports
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
