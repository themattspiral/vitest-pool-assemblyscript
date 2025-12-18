/**
 * Test framework with per-test crash isolation support
 *
 * Execution flow:
 * 1. Instantiation: Pool creates WASM instance with import callbacks
 * 2. Registration: _start() runs, top-level test() calls invoke __register_test callback
 * 3. Discovery: Pool receives test names + function indices via callbacks
 * 4. Execution: Pool calls table.get(fnIndex)() directly via exported function table
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
declare function __assertion_fail<T>(msgPtr: usize, msgLen: i32, expected?: T, actual?: T): void;

/**
 * Register a test (called during top-level code execution in _start())
 *
 * Notifies the Pool via __register_test callback with the test name and function index.
 */
export function test(name: string, fn: () => void): void {
  __register_test(changetype<usize>(name), name.length, fn.index);
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
    __assertion_fail<i32>(changetype<usize>(message), message.length);

    // Abort on failure - terminates WASM execution - must be called from WASM
    // Pool's abort handler will catch this and mark the test as failed
    // Pass the message to abort so it appears in the error output
    abort(message);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string = "Equality assertion failed"): void {
  // TODO - update this to be robust!!
  const condition = expected === actual;

  if (condition) {
    __assertion_pass();
  } else {
    __assertion_fail<T>(changetype<usize>(message), message.length, expected, actual);

    // Abort on failure - terminates WASM execution - must be called from WASM.
    // Imported abort handler will catch this and mark the test as failed.
    abort(message);
  }
}
