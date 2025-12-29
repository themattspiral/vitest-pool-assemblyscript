export type TestCallback = () => void;

export class TestOptions {
  private static readonly IntNull: i32 = -1;
  private static readonly IntFalse: i32 = 0;
  private static readonly IntTrue: i32 = 1;

  private _timeout: i32;
  private _retry: i32;
  private _skip: i32;
  private _only: i32;
  private _fails: i32;

  constructor(
    timeout: i32 = TestOptions.IntNull,
    retry: i32 = TestOptions.IntNull,
    skip: i32 = TestOptions.IntNull,
    only: i32 = TestOptions.IntNull,
    fails: i32 = TestOptions.IntNull,
  ) {
    this._timeout = timeout;
    this._retry = retry;
    this._skip = skip;
    this._only = only;
    this._fails = fails;
  }

  /** Define the timeout threshold (in ms) for a specific test. Other options will be undefined. */
  static timeout(timeoutMs: i32): TestOptions {
    return new TestOptions(timeoutMs);
  }
  /** Set the timeout threshold (in ms) for a specific test. Other options remain unchanged. */
  timeout(timeoutMs: i32): this {
    this._timeout = timeoutMs;
    return this;
  }
  get _valueOfTimeout(): i32 {
    return this._timeout;
  }
  
  /**
   * Define the number of retry attempts that will be made after the initial run
   * when a specific test fails. Other options will be undefined.
   */
  static retry(retryCount: i32): TestOptions {
    return new TestOptions(
      TestOptions.IntNull,
      retryCount
    );
  }
  /**
   * Set the number of retry attempts that will be made after the initial run
   * when a specific test fails. Other options remain unchanged.
   */
  retry(retryCount: i32): this {
    this._retry = retryCount;
    return this;
  }
  get _valueOfRetry(): i32 {
    return this._retry;
  }

  /**
   * Define `skip` option for a specific test so that when true, the test will still be defined
   * but will not execute. Other options will be undefined.
   * 
   * Setting to false has no additional effect (compared to not defining) when creating new TestOptions.
   */
  static skip(isSkipped: bool = true): TestOptions {
    return new TestOptions(
      TestOptions.IntNull,
      TestOptions.IntNull,
      isSkipped ? TestOptions.IntTrue : TestOptions.IntFalse
    );
  }
  /**
   * Set `skip` option for a specific test so that when true, the test will still be defined
   * but will not execute. Other options remain unchanged.
   */
  skip(isSkipped: bool = true): this {
    this._skip = isSkipped ? TestOptions.IntTrue : TestOptions.IntFalse;
    return this;
  }
  get _valueOfSkip(): i32 {
    return this._skip;
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
      TestOptions.IntNull,
      TestOptions.IntNull,
      TestOptions.IntNull,
      isOnly ? TestOptions.IntTrue : TestOptions.IntFalse
    );
  }
  /**
   * Set `only` option for a specific test so that when true (and allowOnly is globally true),
   * the test will execute exclusively while others NOT marked `only` will be skipped.
   * Other options remain unchanged.
   */
  only(isOnly: bool = true): this {
    this._only = isOnly ? TestOptions.IntTrue : TestOptions.IntFalse;
    return this;
  }
  get _valueOfOnly(): i32 {
    return this._only;
  }
  
  /**
   * Define `fails` option for a specific test so that when true, the test will only pass with at least
   * one failing assertion. Other options will be undefined.
   * 
   * Setting to false has no additional effect (compared to not defining) when creating new TestOptions.
   */
  static fails(expectFailure: bool = true): TestOptions {
    return new TestOptions(
      TestOptions.IntNull,
      TestOptions.IntNull,
      TestOptions.IntNull,
      TestOptions.IntNull,
      expectFailure ? TestOptions.IntTrue : TestOptions.IntFalse
    );
  }
  /**
   * Set `fails` option for a specific test so that when true, the test will only pass with at least
   * one failing assertion. Other options remain unchanged.
   * @returns 
   */
  fails(expectFailure: bool = true): this {
    this._fails = expectFailure ? TestOptions.IntTrue : TestOptions.IntFalse;
    return this;
  }
  get _valueOfFails(): i32 {
    return this._fails;
  }

  // -1 === null
  private static mergeNullableInt(a: i32, b: i32, smallestWins: bool = false): i32 {
    if (a < 0 && b < 0) {
      return TestOptions.IntNull;
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
        TestOptions.mergeNullableInt(left!._timeout, right!._timeout, true),   // smallest timeout
        TestOptions.mergeNullableInt(left!._retry, right!._retry),             // largest retry count
        TestOptions.mergeNullableInt(left!._skip, right!._skip),               // true if either is true
        TestOptions.mergeNullableInt(left!._only, right!._only),               // true if either is true
        TestOptions.mergeNullableInt(left!._fails, right!._fails),             // true if either is true
      );
    }
  }
}
