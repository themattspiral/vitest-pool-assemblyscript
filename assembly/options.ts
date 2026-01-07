export const TEST_OPTION_UNDEFINED: i32 = -1;
export const TEST_OPTION_FALSE: i32 = 0;
export const TEST_OPTION_TRUE: i32 = 1;

@final
export class TestOptions {
  _valueOfTimeout: i32;
  _valueOfRetry: i32;
  _valueOfSkip: i32;
  _valueOfOnly: i32;
  _valueOfFails: i32;

  /**
   * Create a new TestOptions instance.
   * 
   * Defaults are all explicitly undefined in AssemblyScript.
   * They are merged with the vitest config (timeout, retry, allowOnly) and
   * also with any suite-level options externally in pool functions.
   */
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
    return new TestOptions(
      timeoutMs,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED,
      TEST_OPTION_UNDEFINED
    );
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
   * Define `skip` option for a specific test so that when true, it will still be registered
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
   * Set `skip` option for a specific test so that when true, it will still be registered
   * but will not execute. Other options remain unchanged.
   */
  skip(isSkipped: bool = true): this {
    this._valueOfSkip = isSkipped ? TEST_OPTION_TRUE : TEST_OPTION_FALSE;
    return this;
  }
  
  /**
   * Define `only` option for a specific test so that when true (and allowOnly is globally true),
   * it will execute exclusively while others NOT marked `only` will be skipped.
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
   * it will execute exclusively while others NOT marked `only` will be skipped.
   * Other options remain unchanged.
   */
  only(isOnly: bool = true): this {
    this._valueOfOnly = isOnly ? TEST_OPTION_TRUE : TEST_OPTION_FALSE;
    return this;
  }

  /**
   * Define `fails` option for a specific test so that when true, it will only pass with at least
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
   * Set `fails` option for a specific test so that when true, it will only pass with at least
   * one failing assertion. Other options remain unchanged.
   */
  fails(expectFailure: bool = true): this {
    this._valueOfFails = expectFailure ? TEST_OPTION_TRUE : TEST_OPTION_FALSE;
    return this;
  }

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

  static __merge(left: TestOptions | null, right: TestOptions | null): TestOptions {
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

  @operator.binary("&")
  static __bitwiseAnd(left: TestOptions | null, right: TestOptions | null): TestOptions {
    return TestOptions.__merge(left, right);
  }

  __merge(other: TestOptions): TestOptions {
    return TestOptions.__merge(this, other);
  }
}

/**
 * Defaults are all explicitly undefined in AssemblyScript.
 * They are merged with the vitest config (timeout, retry, allowOnly) and
 * also with any suite-level options externally in pool functions.
 */
export const DEFAULT_TEST_OPTIONS = new TestOptions();
