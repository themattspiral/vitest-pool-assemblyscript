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

import { equals, identical } from './compare';


function itemMessageString<T>(item: T): string {
  let str = "";

  if (isNullable<T>(item) && item == null) {
    str += "<null>";
  } else if (isString<T>(item)) {
    str += item;
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


@final
export class ExpectMatcher<T> {
  private isInverted: bool = false;
  private isSoft: bool = false;
  private actual: T;

  constructor(val: T) {
    this.actual = val;
  }

  toBe<U>(val: U, message: string | null = null): void {
    this.assertComparison(identical(this.actual, val), this.actual, val, "to be", message);
  }

  toBeCloseTo<U >(): void {}
  
  toEqual<U>(val: U, message: string | null = null): void {
    this.assertComparison(equals(this.actual, val), this.actual, val, "to equal", message);
  }

  get not(): this {
    this.isInverted = !this.isInverted;
    return this;
  }
  
  get soft(): this {
    this.isSoft = true;
    return this;
  }

  private abortTest(message: string): void {
    if (!this.isSoft) {
      abort(message);
    }
  }

  private assertComparison<T, U>(rawCondition: bool, actual: T, expected: U, methodStr: string, message: string | null = null): void {
    const condition = this.isInverted ? !rawCondition : rawCondition;

    if (condition) {
      __assertion_pass();
    } else {
      const notStr = this.isInverted ? "not " : "";
      const actualStr = itemMessageString(actual);
      const expectedStr = itemMessageString(expected);

      const msg = message == null
        ? "Expected " + actualStr + " " + notStr + methodStr + " " + expectedStr
        : message;

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
