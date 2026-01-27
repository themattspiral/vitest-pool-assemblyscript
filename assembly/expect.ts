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
  actual?: T,
  expected?: T
): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__expect_throw")
declare function __expect_throw(fnPtr: usize, errorMsg?: string): void;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "__end_expect_throw")
declare function __end_expect_throw(): void;

import {
  closeTo,
  equals,
  identical,
  truthyOrFalsey
} from './compare';

function itemMessageString<T>(item: T): string {
  let str = "";

  if (isReference<T>(item) && isNullable<T>(item) && item == null) {
    str += "<null>";
  } else if (isString<T>(item)) {
    str += `"${item}"`;
  } else if (isInteger<T>(item) || isFloat<T>(item) || item instanceof Set || item instanceof Map) {
    str += item.toString();
  } else if (item instanceof ArrayBuffer) {
    str = "ArrayBuffer[" + item.byteLength + "]";
  } else if (isArrayLike<T>(item)) {
    str += arrayMessageString(item);
  } else {
    str += nameof<T>(item);
  }

  return str;
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
@final
export class ExpectMatcher<T> {
  private isInverted: bool = false;
  private isSoft: bool = false;
  private actual: T;

  constructor(val: T) {
    this.actual = val;
  }

  get not(): this {
    this.isInverted = !this.isInverted;
    return this;
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
    const isNull: bool = isReference<T>(this.actual) && isNullable<T>(this.actual) && this.actual == null;
    this.assertComparison(isNull, this.actual, null, "to be null", false);
  }
  
  toBeNullable(): void {
    const nullable: bool = isReference<T>(this.actual) && isNullable<T>(this.actual);
    this.assertComparison(nullable, this.actual, null, "to be nullable", false);
  }

  toThrowError(errorMsg: string | null = null): void {
    if (this.isInverted) {
      throw new Error("expect.not operator is not supported with the toThrowError() matcher");
    }

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

  private abortTest(message: string): void {
    if (!this.isSoft) {
      abort(message);
    }
  }

  private assertComparison<T, U>(rawCondition: bool, actual: T, expected: U, methodStr: string, printExpected: boolean): void {
    const condition = this.isInverted ? !rawCondition : rawCondition;

    if (condition) {
      __assertion_pass();
    } else {
      const notStr = this.isInverted ? "not " : "";
      const actualStr = itemMessageString(actual);
      const expectedStr = itemMessageString(expected);
      const msg = `expected ${actualStr} ${notStr}${methodStr}${printExpected ? ` ${expectedStr}` : ""}`;

      __assertion_fail<string>(msg, nameof<T>() + " " + nameof<U>(), true, actualStr, expectedStr);
  
      // Abort on failure - terminates WASM execution - must be called from WASM.
      // Imported abort handler will handle this and mark the test as failed.
      this.abortTest(msg);
    }
  }
}

export function expect<T>(value: T): ExpectMatcher<T> {
  return new ExpectMatcher<T>(value);
}
