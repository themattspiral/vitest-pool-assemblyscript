// @external functions are imported to the WASM execution environment from pool code

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__assertion_pass")
declare function __assertion_pass(): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__assertion_fail")
declare function __assertion_fail<T>(
  msg: string,
  typeName: string,
  valuesProvided: bool,
  expected?: T,
  actual?: T
): void;


/**
 * Minimal conditional (boolean) assertion.
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
export function assert<T>(condition: T, message: string = "Assertion failed"): void {
  if (!!condition) {
    __assertion_pass();
  } else {
    __assertion_fail<i32>(message, nameof<i32>(), false);

    // Abort on failure - terminates WASM execution - must be called from WASM
    // Imported abort handler will handle this and mark the test as failed
    abort(message);
  }
}

/**
 * Generic equality assertion. Assumes the same primitive type for both values.
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
export function assertEqual<T>(actual: T, expected: T, message: string = "Equality assertion failed"): void {
  const condition = expected === actual;

  if (condition) {
    __assertion_pass();
  } else {
    __assertion_fail<T>(message, nameof<T>(), true, expected, actual);

    // Abort on failure - terminates WASM execution - must be called from WASM.
    // Imported abort handler will handle this and mark the test as failed.
    abort(message);
  }
}
