import { TestCallback, TestOptions } from './types';

// WASM imports that Pool provides

// ============================================================================
// Functions imported to the WASM execution environment from pool code
// ============================================================================

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__register_test")
declare function __register_test(
  namePtr: usize,
  nameLen: i32,
  fnIndex: u32,
  timeout: i32,
  retry: i32,
  skip: i32,
  only: i32,
  fails: i32
): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__assertion_pass")
declare function __assertion_pass(): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__assertion_fail")
declare function __assertion_fail<T>(msgPtr: usize, msgLen: i32, typeNamePtr: usize, typeNameLen: i32, valuesProvided: bool, expected?: T, actual?: T): void;


/**
 * Register a test (called during top-level code execution in _start())
 *
 * Notifies the Pool via __register_test callback with the test name and function index.
 */
export const test = (name: string, fn: TestCallback, options: TestOptions | null = null): void => {
  let opts: TestOptions = new TestOptions();
  if (options && options !== null) {
    opts = options;
  }
  
  __register_test(
    changetype<usize>(name),
    name.length,
    fn.index,
    opts._valueOfTimeout,
    opts._valueOfRetry,
    opts._valueOfSkip,
    opts._valueOfOnly,
    opts._valueOfFails
  );
};

export const it = test;

export const skip = (name: string, fn: TestCallback, options: TestOptions | null = null): void => {
  const opts = options && options !== null ? options : new TestOptions();
  return test(name, fn, opts.skip());
};

export const only = (name: string, fn: TestCallback, options: TestOptions | null = null): void => {
  const opts = options && options !== null ? options : new TestOptions();
  return test(name, fn, opts.only());
};

export const fails = (name: string, fn: TestCallback, options: TestOptions | null = null): void => {
  const opts = options && options !== null ? options : new TestOptions();
  return test(name, fn, opts.fails());
};

export function testWith(name: string, options: TestOptions, fn: TestCallback): void {
  test(name, fn, options);
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
    const typeName: string = nameof<i32>();
    __assertion_fail<i32>(changetype<usize>(message), message.length, changetype<usize>(typeName), typeName.length, false);

    // Abort on failure - terminates WASM execution - must be called from WASM
    // Imported abort handler will handle this and mark the test as failed
    abort(message);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string = "Equality assertion failed"): void {
  const condition = expected === actual;

  if (condition) {
    __assertion_pass();
  } else {
    const typeName: string = nameof<T>();
    __assertion_fail<T>(changetype<usize>(message), message.length, changetype<usize>(typeName), typeName.length, true, expected, actual);

    // Abort on failure - terminates WASM execution - must be called from WASM.
    // Imported abort handler will handle this and mark the test as failed.
    abort(message);
  }
}
