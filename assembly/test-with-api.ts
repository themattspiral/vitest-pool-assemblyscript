import {
  TestCallback,
  TEST_OPTION_UNDEFINED,
  TEST_OPTION_FALSE,
  TEST_OPTION_TRUE
} from './test-api';

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

export function testWith(name: string, options: TestOptions, fn: TestCallback): void {
  __register_test(
    changetype<usize>(name),
    name.length,
    fn.index,
    options._valueOfTimeout,
    options._valueOfRetry,
    options._valueOfSkip,
    options._valueOfOnly,
    options._valueOfFails
  );
}

export const skip = (name: string, fn: TestCallback): void => {
  return testWith(name, TestOptions.skip(), fn);
};

export const only = (name: string, fn: TestCallback): void => {
  return testWith(name, TestOptions.only(), fn);
};

export const fails = (name: string, fn: TestCallback): void => {
  return testWith(name, TestOptions.fails(), fn);
};

@unmanaged @final
export class TestOptions {
  _valueOfTimeout: i32;
  _valueOfRetry: i32;
  _valueOfSkip: i32;
  _valueOfOnly: i32;
  _valueOfFails: i32;

  constructor(
    timeout: i32 = TEST_OPTION_UNDEFINED,
    retry: i32 = TEST_OPTION_UNDEFINED,
    skip: i32 = TEST_OPTION_UNDEFINED,
    only: i32 = TEST_OPTION_UNDEFINED,
    fails: i32 = TEST_OPTION_UNDEFINED,
  ) {
    this._valueOfTimeout = timeout;
    this._valueOfRetry = retry;
    this._valueOfSkip = skip;
    this._valueOfOnly = only;
    this._valueOfFails = fails;
  }

  /** Define the timeout threshold (in ms) for a specific test. Other options will be undefined. */
  static timeout(timeoutMs: i32): TestOptions {
    return new TestOptions(timeoutMs);
  }
  /** Set the timeout threshold (in ms) for a specific test. Other options remain unchanged. */
  timeout(timeoutMs: i32): this {
    this._valueOfTimeout = timeoutMs;
    return this;
  }
  
  /**
   * Define the number of retry attempts that will be made after the initial run
   * when a specific test fails. Other options will be undefined.
   */
  static retry(retryCount: i32): TestOptions {
    return new TestOptions(
      TEST_OPTION_UNDEFINED,
      retryCount,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED
    );
  }
  /**
   * Set the number of retry attempts that will be made after the initial run
   * when a specific test fails. Other options remain unchanged.
   */
  retry(retryCount: i32): this {
    this._valueOfRetry = retryCount;
    return this;
  }

  /**
   * Define `skip` option for a specific test so that when true, the test will still be defined
   * but will not execute. Other options will be undefined.
   * 
   * Setting to false has no additional effect (compared to not defining) when creating new TestOptions.
   */
  static skip(isSkipped: bool = true): TestOptions {
    return new TestOptions(
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      isSkipped ? TEST_OPTION_TRUE : TEST_OPTION_FALSE,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED
    );
  }
  /**
   * Set `skip` option for a specific test so that when true, the test will still be defined
   * but will not execute. Other options remain unchanged.
   */
  skip(isSkipped: bool = true): this {
    this._valueOfSkip = isSkipped ? TEST_OPTION_TRUE : TEST_OPTION_FALSE;
    return this;
  }
  
  /**
   * Define `only` option for a specific test so that when true (and allowOnly is globally true),
   * the test will execute exclusively while others NOT marked `only` will be skipped.
   * Other options will be undefined.
   * 
   * Setting to false has no additional effect (compared to not defining) when creating new TestOptions.
   */
  static only(isOnly: bool = true): TestOptions {
    return new TestOptions(
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      isOnly ? TEST_OPTION_TRUE : TEST_OPTION_FALSE,
      TEST_OPTION_UNDEFINED
    );
  }
  /**
   * Set `only` option for a specific test so that when true (and allowOnly is globally true),
   * the test will execute exclusively while others NOT marked `only` will be skipped.
   * Other options remain unchanged.
   */
  only(isOnly: bool = true): this {
    this._valueOfOnly = isOnly ? TEST_OPTION_TRUE : TEST_OPTION_FALSE;
    return this;
  }
  
  /**
   * Define `fails` option for a specific test so that when true, the test will only pass with at least
   * one failing assertion. Other options will be undefined.
   * 
   * Setting to false has no additional effect (compared to not defining) when creating new TestOptions.
   */
  static fails(expectFailure: bool = true): TestOptions {
    return new TestOptions(
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      expectFailure ? TEST_OPTION_TRUE : TEST_OPTION_FALSE
    );
  }
  /**
   * Set `fails` option for a specific test so that when true, the test will only pass with at least
   * one failing assertion. Other options remain unchanged.
   * @returns 
   */
  fails(expectFailure: bool = true): this {
    this._valueOfFails = expectFailure ? TEST_OPTION_TRUE : TEST_OPTION_FALSE;
    return this;
  }

  // -1 === null
  private static mergeNullableInt(a: i32, b: i32, smallestWins: bool = false): i32 {
    if (a < 0 && b < 0) {
      return TEST_OPTION_UNDEFINED;
    } else if (a >= 0 && b < 0) {
      return a;
    } else if (a < 0 && b >= 0) {
      return b;
    } else {
      if (smallestWins) {
        return a < b ? a : b;
      } else {
        return a < b ? b : a;
      }
    }
  }

  @operator.binary("&")
  static __bitwiseAnd(left: TestOptions | null, right: TestOptions | null): TestOptions {
    const leftDefined: bool = left !== null;
    const rightDefined: bool = right !== null;

    if ( !leftDefined && !rightDefined ) {
      return new TestOptions();
    } else if ( leftDefined && !rightDefined ) {
      return left!;
    } else if ( !leftDefined && rightDefined ) {
      return right!;
    } else {
      return new TestOptions(
        TestOptions.mergeNullableInt(left!._valueOfTimeout, right!._valueOfTimeout, true),   // smallest timeout
        TestOptions.mergeNullableInt(left!._valueOfRetry, right!._valueOfRetry),             // largest retry count
        TestOptions.mergeNullableInt(left!._valueOfSkip, right!._valueOfSkip),               // true if either is true
        TestOptions.mergeNullableInt(left!._valueOfOnly, right!._valueOfOnly),               // true if either is true
        TestOptions.mergeNullableInt(left!._valueOfFails, right!._valueOfFails),             // true if either is true
      );
    }
  }
}
