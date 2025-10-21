/**
 * Test framework with per-test crash isolation support
 *
 * Execution flow:
 * 1. Instantiation: Pool creates WASM instance with import callbacks
 * 2. Registration: _start() runs, top-level test() calls invoke __register_test callback
 * 3. Discovery: Pool receives test names + function indices via callbacks
 * 4. Execution: Pool calls __execute_function(fnIndex) for each test in fresh instance
 *
 * Key design decisions:
 * - Per-test isolation: Each test runs in a fresh WASM instance (~0.43ms overhead)
 * - Crash safe: One test aborting doesn't kill subsequent tests (they run in new instances)
 */

// WASM imports that Pool provides

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__register_test")
declare function __register_test(namePtr: usize, nameLen: i32, fnIndex: u32): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__assertion_pass")
declare function __assertion_pass(): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__assertion_fail")
declare function __assertion_fail(msgPtr: usize, msgLen: i32): void;

/**
 * Register a test (called during top-level code execution)
 *
 * Notifies the Pool via __register_test callback with the test name and function index.
 */
export function test(name: string, fn: () => void): void {
  __register_test(changetype<usize>(name), name.length, fn.index);
}

/**
 * Execute a test function by its function table index
 *
 * Called by Pool with a fresh WASM instance for each test.
 * The fnIndex parameter is the value from fn.index captured during registration.
 *
 * This function is simpler than you might expect because:
 * - It ONLY executes the test function
 * - It does NOT call __test_start or __test_pass
 * - Those lifecycle functions are called by the Pool (Node.js side)
 *
 * Why? Because the Pool already knows:
 * - The test name (from registration)
 * - When the test starts (when it calls this function)
 * - When the test passes (when this returns without aborting)
 * - When the test fails (when abort is called)
 *
 */
export function __execute_function(fnIndex: u32): void {
  // Retrieve the function from the function table and execute it
  // AssemblyScript compiler generates call_indirect WASM instruction here
  const fn = changetype<() => void>(fnIndex);
  fn();
}

/**
 * Minimal assertion helper
 *
 * IMPORTANT - AssemblyScript compiler bug workaround:
 * The AS compiler has a const-folding bug with arithmetic comparisons.
 *
 * This FAILS (evaluates to false incorrectly):
 *   assert(1 + 1 == 2, "math works");
 *
 * This WORKS (evaluates correctly):
 *   const sum: i32 = 1 + 1;
 *   assert(sum == 2, "math works");
 *
 * Always assign arithmetic expressions to typed variables before comparison.
 */
export function assert(condition: bool, message: string = "Assertion failed"): void {
  if (condition) {
    __assertion_pass();
  } else {
    __assertion_fail(changetype<usize>(message), message.length);
    // Abort on failure - terminates WASM execution
    // Pool's abort handler will catch this and mark the test as failed
    // Pass the message to abort so it appears in the error output
    abort(message);
  }
}
