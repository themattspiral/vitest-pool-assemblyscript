import {
  closeTo,
  equals,
  identical,
  isNull,
  nan,
  truthyOrFalsey
} from './compare';

// @external functions are imported to the WASM execution environment from pool code

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__assertion_pass")
declare function __assertion_pass(): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__assertion_fail")
declare function __assertion_fail<T>(
  msg: string,
  typeName: string,
  valuesProvided: bool,
  actual?: T,
  expected?: T
): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__expect_throw")
declare function __expect_throw(fnPtr: usize, errorMsg?: string): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("__as_pool_env__", "__end_expect_throw")
declare function __end_expect_throw(): void;


function itemMessageString<T>(item: T): string {
  if (isNull(item)) return "<null>";
  if (nan(item)) return "NaN";

  if (isReference<T>()) {
    if (isString<T>()) return `"${item}"`;
    else if (item instanceof ArrayBuffer) return `ArrayBuffer[${item.byteLength}]`;
    else if (isArrayLike<T>(item)) return arrayMessageString(item);
    else if (item instanceof Set || item instanceof Map) return item.toString();
    else return nameof<T>(item);
  } else if (isBoolean<T>()){
    return bool(item).toString();
  } else if (isInteger<T>(item) || isFloat<T>(item)) {
    return item.toString();
  } else {
    return nameof<T>(item);
  }
}

function arrayMessageString<T extends ArrayLike<unknown>>(array: T): string {
  if (isNullable<T>(array) && array == null) {
    return "<null>";
  }

  let str = "[";
  for (let i = 0; i < array.length; i++) {
    str += itemMessageString(array[i]);

    if (i < array.length - 1) {
      str += ","
    }
  }
  str += "]";

  return str;
}

/**
 * Expect matcher
*/
abstract class BaseExpectMatcher<T> {
  protected isInverted: bool = false;
  protected isSoft: bool = false;
  protected actual: T;

  constructor(val: T) {
    this.actual = val;
  }

  get not(): InvertedExpectMatcher<T> {
    return new InvertedExpectMatcher(this.actual, !this.isInverted);
  }
  
  // get soft(): this {
  //   this.isSoft = true;
  //   return this;
  // }

  /**
   * Checks that a value is what you expect. Primitives and strings are compared directly,
   * and references are checked for reference equality only (including objects, arrays, etc).
   * Don't use `toBe` with floating-point numbers - see `toBeCloseTo` instead.
   */
  toBe<U>(val: U): void {
    this.assertComparison(identical(this.actual, val), this.actual, val, "to be", true);
  }

  /**
   * Checks if a value is close to what you expect. Using exact equality with floating point
   * numbers often doesn't work correctly, because small internal rounding occurs to be able
   * to represent floats in binary. This rounding means intuitive comparisons will often fail.
   * 
   * Comparing strings, integers, or references will fall back to using a `toBe` comparison.
   * 
   * @param precision - Specify an integer representing the number of decimal places 
   * that must match for values to be considered close. Defaults to 2 digits, meaning effectively
   * that values must be within 0.005 of each other.
   */
  toBeCloseTo<U>(val: U, precision: i32 = 2): void {
    this.assertComparison(closeTo(this.actual, val, precision), this.actual, val, "to be close to", true);
  }
  
  /**
   * Used when you want to check that two objects have the same value. Currently supports checking
   * equality of Arrays, Sets, Maps, and nulls. Does not yet support user-defined object field checking.
   */
  toEqual<U>(val: U): void {
    this.assertComparison(equals(this.actual, val), this.actual, val, "to deeply equal", true);
  }
  
  /** Alias for `toEqual`. Currently no differences in AssemblyScript. */
  toStrictEqual<U>(val: U): void {
    this.assertComparison(equals(this.actual, val), this.actual, val, "to strictly equal", true);
  }

  toBeTruthy(): void {
    this.assertComparison(truthyOrFalsey(this.actual, true), this.actual, true, "to be truthy", false);
  }
  
  toBeFalsey(): void {
    this.assertComparison(truthyOrFalsey(this.actual, false), this.actual, false, "to be falsey", false);
  }

  toBeNull(): void {
    this.assertComparison(isNull(this.actual), this.actual, null, "to be null", false);
  }
  
  toBeNullable(): void {
    const actualIsNull = isNull(this.actual);

    if (actualIsNull) {
      this.assertComparison(true, this.actual, null, "to be nullable", false, false);
    } else if (isReference<T>()) {
      this.assertComparison(isNullable<T>(), this.actual, null, "to be nullable", false, false);
    } else {
      this.assertComparison(false, this.actual, null, "to be nullable", false, false);
    }
  }

  toBeNaN(): void {
    this.assertComparison(nan(this.actual), this.actual, NaN, "to be NaN", false);
  }

  toHaveLength<U extends number>(length: U): void {
    const actualIsNull = isNull(this.actual);

    if (actualIsNull) {
      this.assertComparison(false, null, length, "to have length", true);
    } else if (isReference<T>()) {
      if (isArray<T>() || isArrayLike<T>()) {
        const nonNullActual = <NonNullable<T>>this.actual;

        if (isFloat<U>()) {
          // @ts-ignore
          this.assertComparison<number, U>(closeTo<number, U>(nonNullActual.length, length), nonNullActual.length, length, "to have length", true);
        } else {
          // @ts-ignore
          this.assertComparison<number, U>(identical<number, U>(nonNullActual.length, length), nonNullActual.length, length, "to have length", true);
        }
      } else {
        this.assertComparison(false, this.actual, length, "to have length", true);
      }
    } else {
      this.assertComparison(false, this.actual, length, "to have length", true);
    }
  }

  protected abortTest(message: string): void {
    if (!this.isSoft) {
      abort(message);
    }
  }

  protected assertComparison<U, V>(rawCondition: bool, actual: U, expected: V, methodStr: string, printExpected: bool, provideDiff: bool = true): void {
    const condition = this.isInverted ? !rawCondition : rawCondition;

    if (condition) {
      __assertion_pass();
    } else {
      const notStr = this.isInverted ? "not " : "";
      const actualStr = itemMessageString(actual);
      const expectedStr = itemMessageString(expected);
      const msg = `expected ${actualStr} ${notStr}${methodStr}${printExpected ? ` ${expectedStr}` : ""}`;

      __assertion_fail<string>(msg, nameof<U>() + " " + nameof<V>(), provideDiff, actualStr, expectedStr);
  
      // Abort on failure - terminates WASM execution - must be called from WASM.
      // Imported abort handler will handle this and mark the test as failed.
      this.abortTest(msg);
    }
  }
}

class StandardExpectMatcher<T> extends BaseExpectMatcher<T> {
  constructor(val: T) {
    super(val);
  }

  toThrowError(errorMsg: string | null = null): void {
    if (isFunction<T>()) {
      // @ts-ignore
      const fnIndex = this.actual.index;

      if (errorMsg == null) {
        __expect_throw(fnIndex);
      } else {
        __expect_throw(fnIndex, errorMsg);
      }

      // if we get here it didn't throw, so this handles the missing error
      __end_expect_throw();
    } else {
      throw new Error("expect() requires a callback function when used with toThrowError() matcher");
    }
  }

  /** Alias for `toThrowError` */
  toThrow(errorMsg: string | null = null): void {
    this.toThrowError(errorMsg);
  }
}

class InvertedExpectMatcher<T> extends BaseExpectMatcher<T> {
  constructor(val: T, isInverted: bool) {
    super(val);

    // allow chaining multiple nots if desired
    this.isInverted = isInverted;
  }
}

export function expect<T>(value: T): StandardExpectMatcher<T> {
  return new StandardExpectMatcher<T>(value);
}
