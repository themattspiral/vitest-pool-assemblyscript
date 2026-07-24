import { TestOptionValue } from './portable/constants';

@final
export class TestOptions {
  _valueOfTimeout: i32;
  _valueOfRetry: i32;
  _valueOfSkip: TestOptionValue;
  _valueOfOnly: TestOptionValue;
  _valueOfFails: TestOptionValue;

  /**
   * Create a new TestOptions instance.
   * 
   * Defaults are all explicitly undefined in AssemblyScript.
   * They are merged with the vitest config (timeout, retry, allowOnly) and
   * also with any suite-level options externally in pool functions.
   */
  constructor(
    timeout: i32 = TestOptionValue.OptionUndefined,
    retry: i32 = TestOptionValue.OptionUndefined,
    skip: TestOptionValue = TestOptionValue.OptionUndefined,
    only: TestOptionValue = TestOptionValue.OptionUndefined,
    fails: TestOptionValue = TestOptionValue.OptionUndefined,
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
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined
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
      TestOptionValue.OptionUndefined,
      retryCount,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined
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
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      isSkipped ? TestOptionValue.OptionTrue : TestOptionValue.OptionFalse,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined
    );
  }
  /**
   * Set `skip` option for a specific test so that when true, it will still be registered
   * but will not execute. Other options remain unchanged.
   */
  skip(isSkipped: bool = true): this {
    this._valueOfSkip = isSkipped ? TestOptionValue.OptionTrue : TestOptionValue.OptionFalse;
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
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      isOnly ? TestOptionValue.OptionTrue : TestOptionValue.OptionFalse,
      TestOptionValue.OptionUndefined
    );
  }
  /**
   * Set `only` option for a specific test so that when true (and allowOnly is globally true),
   * it will execute exclusively while others NOT marked `only` will be skipped.
   * Other options remain unchanged.
   */
  only(isOnly: bool = true): this {
    this._valueOfOnly = isOnly ? TestOptionValue.OptionTrue : TestOptionValue.OptionFalse;
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
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      TestOptionValue.OptionUndefined,
      expectFailure ? TestOptionValue.OptionTrue : TestOptionValue.OptionFalse
    );
  }
  /**
   * Set `fails` option for a specific test so that when true, it will only pass with at least
   * one failing assertion. Other options remain unchanged.
   */
  fails(expectFailure: bool = true): this {
    this._valueOfFails = expectFailure ? TestOptionValue.OptionTrue : TestOptionValue.OptionFalse;
    return this;
  }

  private static mergeNullableInt(a: i32, b: i32, smallestWins: bool = false): i32 {
    if (a < 0 && b < 0) {
      return TestOptionValue.OptionUndefined;
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
