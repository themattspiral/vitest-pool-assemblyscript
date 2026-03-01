import {
  closeTo,
  compareInequality,
  EqualityResult,
  equals,
  identical,
  InequalityOperation,
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
  if (isNull(item)) return "null";
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
    return "null";
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

  /** Inverts the matcher that follows. Can be chained. */
  get not(): InvertedExpectMatcher<T> {
    return new InvertedExpectMatcher(this.actual, !this.isInverted);
  }
  
  // get soft(): this {
  //   this.isSoft = true;
  //   return this;
  // }

  /**
   * Checks that a value is what you expect using identity comparison. Primitives and strings
   * are compared by value, and references are checked for reference equality only (including
   * objects, arrays, etc). SIMD vectors use WASM's native `==` comparison, which compares at 
   * the bit level, ignoring lane type.
   *
   * Cross-type numeric comparisons are allowed where AssemblyScript's own `==` operator
   * permits them (e.g. `f64` vs `i32`). `toBeCloseTo()` is safer for any comparison
   * involving a float and allows all numeric types because it can still produce accurate
   * results in precision-loss casting edge cases.
   *
   * @throws When comparing float/integer types where the float's mantissa cannot losslessly
   * represent the integer type's range (e.g. `f32` vs `i32`, `f64` vs `i64`).
   * @throws When comparing fundamentally incompatible types: reference vs value type
   * (e.g. `string` vs `i32`, unless one is null/zero), or `v128` vs non-vector type.
   *
   * @example
   * expect(1 + 1).toBe(2);
   * expect("hello").toBe("hello");
   *
   * // cross-type integer comparisons
   * expect(i64(42)).toBe(u8(42));
   *
   * // supported float/integer comparisons (small integer types)
   * expect(f64(42.0)).toBe(i32(42));
   *
   * // SIMD vectors: different lane types with the same underlying bits are identical
   * expect(i64x2(3, 7)).toBe(i32x4(3, 0, 7, 0));
   *
   * // unsupported float/integer comparisons throw an error
   * // expect(f32(42.0)).toBe(i32(42));  // Error: float precision insufficient
   * // expect(f64(42.0)).toBe(i64(42));  // Error: float precision insufficient
   */
  toBe<U>(val: U): void {
    this.assertComparison(identical(this.actual, val), this.actual, val, "to be", true);
  }

  /**
   * Checks if a value is close to what you expect, most useful for comparing floating point 
   * numbers to any other numbers. Using exact equality with floating point numbers often doesn't 
   * work correctly, because of internal rounding to represent floats in binary. This rounding 
   * means intuitive comparisons will often fail, so this matcher checks if they are "close enough"
   * to be considered equal.
   *
   * Strings are compared by value equality as with `toBe`. Non-numeric, non-string types return false.
   *
   * SIMD `v128` vectors are not supported, as approximate comparison requires a lane type
   * interpretation to extract numeric values. Extract lane values as needed and compare them individually.
   *
   * @param precision - Specify the number of decimal places that must match for values to be
   * considered close. Defaults to 2 digits, meaning effectively that values must be within 0.005 of
   * each other.
   *
   * @throws When either value is a `v128` vector.
   *
   * @example
   * expect(0.1 + 0.2).toBeCloseTo(0.3);
   * expect(1.005).toBeCloseTo(1.0, 1);
   */
  toBeCloseTo<U>(val: U, precision: i32 = 2): void {
    this.assertComparison(closeTo(this.actual, val, precision), this.actual, val, "to be close to", true);
  }

  /**
   * Checks that a value is greater than the expected value. Supports numeric types
   * (integers, floats, booleans) and strings (lexicographic comparison).
   *
   * Cross-type numeric comparisons are allowed where safe, including cross-sign integers
   * (more permissive than AS's own `>` operator). Booleans are treated as numeric
   * (true=1, false=0).
   *
   * SIMD `v128` vectors are not supported, as numeric lane-wise comparison requires a 
   * specific lane type interpretation. Extract lane values and compare them individually instead.
   *
   * @throws When comparing float/integer types where the float's mantissa cannot losslessly
   * represent the integer type's range (e.g. `f32` vs `i32`, `f64` vs `i64`).
   * @throws When comparing nullable strings where either value is null. Use `toBeNull()`
   * to check for null values.
   * @throws When comparing non-string reference types (objects, arrays, etc) or `v128` vectors.
   *
   * @example
   * expect(10).toBeGreaterThan(5);
   * expect(3.14).toBeGreaterThan(3);
   * expect("banana").toBeGreaterThan("apple");
   */
  toBeGreaterThan<U>(val: U): void {
    this.assertComparison(
      compareInequality(this.actual, val, InequalityOperation.GreaterThan),
      this.actual, val, "to be greater than", true
    );
  }

  /**
   * Checks that a value is greater than or equal to the expected value. Supports numeric
   * types (integers, floats, booleans) and strings (lexicographic comparison).
   *
   * Cross-type numeric comparisons are allowed where safe, including cross-sign integers
   * (more permissive than AS's own `>=` operator). Booleans are treated as numeric
   * (true=1, false=0).
   *
   * SIMD `v128` vectors are not supported, as numeric lane-wise comparison requires a 
   * specific lane type interpretation. Extract lane values and compare them individually instead.
   *
   * @throws When comparing float/integer types where the float's mantissa cannot losslessly
   * represent the integer type's range (e.g. `f32` vs `i32`, `f64` vs `i64`).
   * @throws When comparing nullable strings where either value is null. Use `toBeNull()`
   * to check for null values.
   * @throws When comparing non-string reference types (objects, arrays, etc) or `v128` vectors.
   *
   * @example
   * expect(10).toBeGreaterThanOrEqual(10);
   * expect(3.14).toBeGreaterThanOrEqual(3);
   */
  toBeGreaterThanOrEqual<U>(val: U): void {
    this.assertComparison(
      compareInequality(this.actual, val, InequalityOperation.GreaterThanOrEqual),
      this.actual, val, "to be greater than or equal to", true
    );
  }

  /**
   * Checks that a value is less than the expected value. Supports numeric types
   * (integers, floats, booleans) and strings (lexicographic comparison).
   *
   * Cross-type numeric comparisons are allowed where safe, including cross-sign integers
   * (more permissive than AS's own `<` operator). Booleans are treated as numeric
   * (true=1, false=0).
   *
   * SIMD `v128` vectors are not supported, as numeric lane-wise comparison requires a 
   * specific lane type interpretation. Extract lane values and compare them individually instead.
   *
   * @throws When comparing float/integer types where the float's mantissa cannot losslessly
   * represent the integer type's range (e.g. `f32` vs `i32`, `f64` vs `i64`).
   * @throws When comparing nullable strings where either value is null. Use `toBeNull()`
   * to check for null values.
   * @throws When comparing non-string reference types (objects, arrays, etc) or `v128` vectors.
   *
   * @example
   * expect(5).toBeLessThan(10);
   * expect(3).toBeLessThan(3.14);
   * expect("apple").toBeLessThan("banana");
   */
  toBeLessThan<U>(val: U): void {
    this.assertComparison(
      compareInequality(this.actual, val, InequalityOperation.LessThan),
      this.actual, val, "to be less than", true
    );
  }

  /**
   * Checks that a value is less than or equal to the expected value. Supports numeric
   * types (integers, floats, booleans) and strings (lexicographic comparison).
   *
   * Cross-type numeric comparisons are allowed where safe, including cross-sign integers
   * (more permissive than AS's own `<=` operator). Booleans are treated as numeric
   * (true=1, false=0).
   *
   * SIMD `v128` vectors are not supported, as numeric lane-wise comparison requires a 
   * specific lane type interpretation. Extract lane values and compare them individually instead.
   *
   * @throws When comparing float/integer types where the float's mantissa cannot losslessly
   * represent the integer type's range (e.g. `f32` vs `i32`, `f64` vs `i64`).
   * @throws When comparing nullable strings where either value is null. Use `toBeNull()`
   * to check for null values.
   * @throws When comparing non-string reference types (objects, arrays, etc) or `v128` vectors.
   *
   * @example
   * expect(5).toBeLessThanOrEqual(5);
   * expect(3).toBeLessThanOrEqual(3.14);
   */
  toBeLessThanOrEqual<U>(val: U): void {
    this.assertComparison(
      compareInequality(this.actual, val, InequalityOperation.LessThanOrEqual),
      this.actual, val, "to be less than or equal to", true
    );
  }

  /**
   * Checks that two values have the same value (deep equality). Primitives and strings
   * are compared by value, and object references are tested for deep equality.
   * 
   * Like `toBe`, cross-type numeric comparisons follow AssemblyScript's own `==` operator
   * restrictions. `toBeCloseTo()` is safer for any comparison involving a float and
   * accurately handles precision-loss edge cases.
   * 
   * Built-in object references are compared with the following deep equality rules:
   * - `Array`, `StaticArray`, `TypedArray`: element-by-element comparison using `toEqual()` recursively
   * - `Set`: deep element equality (same elements, order-independent) using `toEqual()`
   * - `Map`: key-by-key comparison using `toEqual()` on values
   * - `ArrayBuffer`: byte-level content comparison
   *
   * Arrays and Sets support cross-type element comparison where element types are compatible
   * (e.g. `Array<i32>` vs `Array<f64>`). Maps currently require exact generic type match.
   *
   * User object references of the same runtime type are compared using a deep field-by-field
   * comparison of all stored instance fields using `toEqual()` recursively.
   * - Includes public, protected, and private fields
   * - Getters are **excluded**
   * - User-defined `@operator("==")` or `.equals()` methods are used if present, instead 
   *   of field-by-field comparison
   * - Supports inheritance, generics, and nullable fields
   * - Objects with different runtime types are not equal even when they share 
   *   the same fields & values, making behavior the same as `toStrictEqual` in the
   *   AssemblyScript pool. This differs from vitest's JavaScript `toEqual()`, 
   *   which compares structurally regardless of constructor / runtime type
   * - Note: If a user class extends a library class (from `node_modules` or AS stdlib),
   *   only the user class's own declared fields are compared. Inherited library fields
   *   are not included, as deep equality injection is scoped to user source files only
   *
   * SIMD vectors use WASM's native `==` comparison, which compares at the bit level, 
   * ignoring lane type. 
   *
   * @throws When comparing float/integer types where the float's mantissa cannot losslessly
   * represent the integer type's range (e.g. `f32` vs `i32`, `f64` vs `i64`).
   * @throws When comparing fundamentally incompatible types: reference vs value type
   * (e.g. `string` vs `i32`, unless one is null/zero), or `v128` vs non-vector type.
   * @throws When comparing containers with incompatible element types (e.g. `Array<string>`
   * vs `Array<i32>`), or precision-loss numeric combinations (e.g. `Array<f32>` vs `Array<i32>`).
   *
   * @example
   * expect([1, 2, 3]).toEqual([1, 2, 3]);
   * expect(["one", "two", "three"]).toEqual(["one", "two", "three"]);
   *
   * // ArrayBuffer byte-level comparison
   * const a = new ArrayBuffer(4);
   * const b = new ArrayBuffer(4);
   * store<u8>(changetype<usize>(a), 0x42);
   * store<u8>(changetype<usize>(b), 66);  // 66 decimal == 0x42 hex
   * expect(a).toEqual(b);
   *
   * // SIMD vectors: different lane types with the same underlying bits are equal
   * expect(i64x2(3, 7)).toEqual(i32x4(3, 0, 7, 0));
   *
   * // user-defined objects: deep equality
   * const p1 = new Point(1, 2);
   * const p2 = new Point(1, 2);
   * expect(p1).toEqual(p2);
   */
  toEqual<U>(val: U): void {
    const result = equals(this.actual, val);
    const suffix = result == EqualityResult.RuntimeTypeMismatch ? " (runtime type mismatch)" : "";
    this.assertComparison(result == EqualityResult.Equal, this.actual, val, "to deeply equal", true, true, suffix);
  }
  
  /**
   * Alias for `toEqual`, no functional difference.
   * 
   * In JavaScript, `toEqual` compares structurally regardless of type,
   * while `toStrictEqual` requires the same runtime type.
   * 
   * In AssemblyScript, `toEqual` already requires matching runtime types, 
   * which is consistent with how most testing frameworks behave for statically-typed 
   * languages without runtime reflection.
   *
   * @example
   * const p1 = new Point(1, 2);
   * const p2 = new Point(1, 2);
   * expect(p1).toEqual(p2);
   */
  toStrictEqual<U>(val: U): void {
    const result = equals(this.actual, val);
    const suffix = result == EqualityResult.RuntimeTypeMismatch ? " (runtime type mismatch)" : "";
    this.assertComparison(result == EqualityResult.Equal, this.actual, val, "to strictly equal", true, true, suffix);
  }

  /**
   * Checks that a value is truthy (not `0`, `false`, `NaN`, or `null`).
   *
   * Unlike in JavaScript, empty string (`""`) is truthy in AssemblyScript because it is
   * an object reference, not a primitive. An empty string is still an allocated object
   * with a non-zero address, so it evaluates as truthy.
   *
   * A SIMD `v128` vector with at least one non-zero bit is truthy; an all-zero vector is falsy.
   *
   * @example
   * expect(1).toBeTruthy();
   * expect("hello").toBeTruthy();
   * expect("").toBeTruthy();  // truthy in AS (unlike JS)
   * expect(i32x4.splat(1)).toBeTruthy();
   */
  toBeTruthy(): void {
    this.assertComparison(truthyOrFalsey(this.actual, true), this.actual, true, "to be truthy", false);
  }

  /**
   * Checks that a value is falsy (`0`, `false`, `NaN`, or `null`).
   *
   * Unlike in JavaScript, empty string (`""`) is NOT falsy in AssemblyScript because it is
   * an object reference, not a primitive. An empty string is still an allocated object
   * with a non-zero address, so it evaluates as truthy.
   *
   * An all-zero SIMD `v128` vector is falsy; a vector with at least one non-zero bit is truthy.
   *
   * @example
   * expect(0).toBeFalsy();
   * expect(NaN).toBeFalsy();
   * expect(null).toBeFalsy();
   * expect("").not.toBeFalsy();  // not falsy in AS (unlike JS)
   * expect(i32x4.splat(0)).toBeFalsy();
   */
  toBeFalsy(): void {
    this.assertComparison(truthyOrFalsey(this.actual, false), this.actual, false, "to be falsey", false);
  }

  /** @deprecated Use `toBeFalsy()` instead. */
  toBeFalsey(): void {
    this.toBeFalsy();
  }

  /**
   * Checks that a value is null (`usize(0)` in AssemblyScript).
   *
   * @example
   * const val: string | null = null;
   * expect(val).toBeNull();
   * expect("hello").not.toBeNull();
   * expect(0).not.toBeNull();
   * expect(false).not.toBeNull();
   */
  toBeNull(): void {
    this.assertComparison(isNull(this.actual), this.actual, null, "to be null", false);
  }

  /**
   * Checks that the type of the value is nullable (can hold `null`). This is a type-level
   * check, not a value check - a bare `null` (which is `usize(0)`) is not itself a nullable type.
   * Use `toBeNull()` to check if a value is null.
   *
   * @example
   * const val: string | null = null;
   * expect(val).toBeNullable();
   * expect("hello").not.toBeNullable();
   */
  toBeNullable(): void {
    if (isReference<T>()) {
      this.assertComparison(isNullable<T>(), this.actual, null, "to be nullable", false, false);
    } else {
      this.assertComparison(false, this.actual, null, "to be nullable", false, false);
    }
  }

  /**
   * Checks that a floating point value is `NaN`.
   *
   * @example
   * expect(NaN).toBeNaN();
   * expect(1.0).not.toBeNaN();
   */
  toBeNaN(): void {
    this.assertComparison(nan(this.actual), this.actual, NaN, "to be NaN", false);
  }

  /**
   * Checks that an array or array-like value has the expected length.
   * Uses `toBeCloseTo` semantics when the expected length is a float.
   *
   * @example
   * expect([1, 2, 3]).toHaveLength(3);
   * expect([]).toHaveLength(0);
   * expect("hello world").toHaveLength(11);
   */
  toHaveLength<U extends number>(length: U): void {
    const actualIsNull = isNull(this.actual);

    if (actualIsNull) {
      this.assertComparison(false, null, length, "to have length", true);
    } else if (isReference<T>()) {
      if (isArray<T>() || isArrayLike<T>()) {
        const nonNullActual = <NonNullable<T>>this.actual;

        if (isFloat<U>()) {
          // @ts-ignore: .length is i32; use closeTo for float comparison
          this.assertComparison<i32, U>(closeTo<i32, U>(nonNullActual.length, length), nonNullActual.length, length, "to have length", true);
        } else {
          // @ts-ignore: .length is i32; compare as integers
          this.assertComparison<i32, U>(identical<i32, U>(nonNullActual.length, length), nonNullActual.length, length, "to have length", true);
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

  protected assertComparison<U, V>(rawCondition: bool, actual: U, expected: V, methodStr: string, printExpected: bool, provideDiff: bool = true, suffix: string = ""): void {
    const condition = this.isInverted ? !rawCondition : rawCondition;

    if (condition) {
      __assertion_pass();
    } else {
      const notStr = this.isInverted ? "not " : "";
      const actualStr = itemMessageString(actual);
      const expectedStr = itemMessageString(expected);
      const msg = `expected ${actualStr} ${notStr}${methodStr}${printExpected ? ` ${expectedStr}` : ""}${suffix}`;

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

  /**
   * Checks that a function throws an error when called. Optionally checks that the
   * error message matches the provided string. The callback traps/aborts WASM execution,
   * which is caught and evaluated by the pool. Also available as `toThrow()`.
   *
   * Note: Requires a void callback passed to `expect()`. Does not support `.not` inversion.
   *
   * @param errorMsg - Optional expected error message to match against.
   *
   * @example
   * expect(() => { throw new Error("boom"); }).toThrowError();
   * expect(() => { throw new Error("boom"); }).toThrowError("boom");
   */
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
