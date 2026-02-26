/**
 * Result of a deep equality comparison.
 * Declared @global so it is available in all source files without import —
 * including transform-injected deep equality methods in user classes.
 */
// @ts-ignore: AS-specific @global decorator
@global
export enum EqualityResult {
  Equal,
  NotEqual,
  TypeMismatch,
}

function arrayEquals<T extends ArrayLike<unknown>, U extends ArrayLike<unknown>>(actual: T, expected: U): EqualityResult {
  if (actual.length != expected.length) {
    return EqualityResult.NotEqual;
  }

  for (let i = 0; i < expected.length; i++) {
    const result = equals(actual[i], expected[i]);
    if (result != EqualityResult.Equal) {
      return result;
    }
  }

  return EqualityResult.Equal;
}

function setEquals<T, U>(actual: T, expected: U): EqualityResult {
  if (actual instanceof Set && expected instanceof Set) {
    if (actual.size != expected.size) {
      return EqualityResult.NotEqual;
    }

    const expectedValues = expected.values();

    for (let i = 0; i < expectedValues.length; i++) {
      if (!actual.has(expectedValues[i])) {
        return EqualityResult.NotEqual;
      }
    }

    return EqualityResult.Equal;
  }

  return EqualityResult.NotEqual;
}

function arrayBufferEquals<T, U>(actual: T, expected: U): EqualityResult {
  if (!(actual instanceof ArrayBuffer) || !(expected instanceof ArrayBuffer)) {
    return EqualityResult.NotEqual;
  }

  if (actual.byteLength != expected.byteLength) {
    return EqualityResult.NotEqual;
  }

  const actualPtr = changetype<usize>(actual);
  const expectedPtr = changetype<usize>(expected);
  const wordCount: usize = actual.byteLength / 8;
  const remainder: usize = actual.byteLength % 8;

  // compare 8 bytes at a time (u64 word-sized comparison)
  for (let i: usize = 0; i < wordCount; i++) {
    if (load<u64>(actualPtr + i * 8) != load<u64>(expectedPtr + i * 8)) {
      return EqualityResult.NotEqual;
    }
  }

  // compare remaining 0-7 bytes individually
  const remainderOffset = wordCount * 8;
  for (let i: usize = 0; i < remainder; i++) {
    if (load<u8>(actualPtr + remainderOffset + i) != load<u8>(expectedPtr + remainderOffset + i)) {
      return EqualityResult.NotEqual;
    }
  }

  return EqualityResult.Equal;
}

function mapEquals<T, U>(actual: T, expected: U): EqualityResult {
  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size != expected.size) {
      return EqualityResult.NotEqual;
    }

    const expectedKeys = expected.keys();

    for (let i = 0; i < expectedKeys.length; i++) {
      const key = expectedKeys[i];

      if (!actual.has(key)) {
        return EqualityResult.NotEqual;
      }

      const result = equals(actual.get(key), expected.get(key));
      if (result != EqualityResult.Equal) {
        return result;
      }
    }

    return EqualityResult.Equal;
  }

  return EqualityResult.NotEqual;
}

/**
 * Generic primitive / reference equality comparison. Assumes comparable primitive types
 * (or same reference type) for provided values.
 */
export function identical<T, U>(actual: T, expected: U): bool {
  // both refs
  if (isReference<T>() && isReference<U>()) {
    const actualIsNullable = isNullable<T>();
    // Use changetype pointer check instead of `== null` to avoid invoking
    // user-defined @operator("==") overloads, which reject null arguments
    const actualIsNull = actualIsNullable && changetype<usize>(actual) == 0;
    const expectedIsNullable = isNullable<U>();
    const expectedIsNull = expectedIsNullable && changetype<usize>(expected) == 0;
    
    // null refs
    if (actualIsNull && expectedIsNull) {
      return true;
    } else if ( (actualIsNull && !expectedIsNull) || (!actualIsNull && expectedIsNull) ) {
      return false;
    }

    // strings
    if (isString<T>() && isString<U>()) {
      return <string>actual == <string>expected;
    } else {
      // object refs
      return changetype<usize>(actual) == changetype<usize>(expected);
    }
  } else if (isReference<T>() && !isReference<U>()) { 
    // actual is null ref, expected bare null
    return changetype<usize>(actual) == usize(0) && expected == usize(0);
  } else if (!isReference<T>() && isReference<U>()) { 
    // actual is bare null, expected is null ref
    return actual == usize(0) && changetype<usize>(expected) == usize(0);
  } else { // both primitives
    if ( (isBoolean<T>() && !isBoolean<U>()) || (!isBoolean<T>() && isBoolean<U>())
    ) {
      // when one is boolean and the other is not, they are not identical
      return false;
    } else if (isInteger<T>() && isInteger<U>()) {
      if (isSigned<T>() && isSigned<U>()) {
        return i64(actual) == i64(expected);
      } else if (isSigned<T>() && !isSigned<U>()) {
        if (i64(actual) < 0) {
          return false;
        }
        return u64(actual) == u64(expected);
      } else if (!isSigned<T>() && isSigned<U>()) {
        if (i64(expected) < 0) {
          return false;
        }
        return u64(actual) == u64(expected);
      } else {
        return u64(actual) == u64(expected);
      }
    } else if (isFloat<T>() && isFloat<U>()) {
      return f64(actual) === f64(expected);
    } else if ( (isFloat<T>() && isInteger<U>()) || (isInteger<T>() && isFloat<U>()) ) {
      // Reject combinations where the float's mantissa cannot losslessly represent
      // the integer type's full range. This mirrors AssemblyScript's own == operator,
      // which rejects these same combinations at compile time (e.g. f32 == i32, f64 == i64).
      if (isFloat<T>() && isInteger<U>()) {
        if (sizeof<U>() >= sizeof<T>()) {
          throw new Error(
            "Cannot compare " + nameof<T>() + " with " + nameof<U>()
            + ": float precision is insufficient for the integer type's range."
            + " Cast both values to f64 before comparing, e.g. expect(f64(a)).toBe(f64(b))."
            + " Note: large integer values may lose precision when cast to f64, which could cause false positives."
          );
        }
      } else {
        if (sizeof<T>() >= sizeof<U>()) {
          throw new Error(
            "Cannot compare " + nameof<T>() + " with " + nameof<U>()
            + ": float precision is insufficient for the integer type's range."
            + " Cast both values to f64 before comparing, e.g. expect(f64(a)).toBe(f64(b))."
            + " Note: large integer values may lose precision when cast to f64, which could cause false positives."
          );
        }
      }
      return f64(actual) === f64(expected);
    } else if (isVector<T>() && isVector<U>()) {
      return <v128>actual == <v128>expected;
    } else {
      return false;
    } 
  }
}

export function closeTo<T, U>(actual: T, expected: U, precision: i32 = 2): bool {
  // Note: closeTo intentionally does NOT delegate to equals()/identical() for its
  // initial exact-match check, because identical() now throws for float/integer
  // combinations the language rejects (e.g. f32 vs i32). closeTo handles these
  // via its own f64 promotion, which is appropriate for approximate comparison.

  if (isString<T>() && isString<U>()) {
    return <string>actual == <string>expected;
  }

  if ( (isFloat<T>() || isInteger<T>()) && (isFloat<U>() || isInteger<U>()) ) {
    const actualF64: f64 = f64(actual);
    const expectedF64: f64 = f64(expected);

    // exact match shortcut (also handles ±Infinity)
    if (actualF64 === expectedF64) {
      return true;
    }

    const expectedDiff: f64 = 10.0 ** -precision / 2.0;
    const receivedDiff: f64 = Math.abs(expectedF64 - actualF64);
    return receivedDiff < expectedDiff;
  }

  if (isVector<T>() || isVector<U>()) {
    throw new Error(
      "Approximate comparison is not supported for " + nameof<T>() + " and " + nameof<U>()
      + ". Extract lane values and compare them individually with toBeCloseTo()."
    );
  }

  return false;
}

/**
 * Generic value equality comparison. Assumes comparable types for both values.
 * Supports primitives, strings, Arrays, Sets, Maps, ArrayBuffers, and user-defined
 * types (via compiler transform-injected deep equality method).
 *
 * Returns an EqualityResult enum to distinguish between "not equal" and "type mismatch",
 * enabling matchers to produce more informative assertion failure messages.
 */
export function equals<T, U>(actual: T, expected: U): EqualityResult {
  let exactMatch: bool = false;

  // allow boolean-to-number comparisons here
  if (isBoolean<T>() && !isBoolean<U>()) {
    exactMatch = identical(u8(actual), expected);
  } else if (!isBoolean<T>() && isBoolean<U>()) {
    exactMatch = identical(actual, u8(expected));
  } else {
    exactMatch = identical(actual, expected);
  }

  if (!isReference<T>() || isString<T>() || isVector<T>()) {
    // non-bool primitives or strings: return result of comparing
    return exactMatch ? EqualityResult.Equal : EqualityResult.NotEqual;
  } else if (exactMatch) {
    // primitive / reference comparison passed already
    return EqualityResult.Equal;
  }

  if (isNullable<T>()) {
    // Use changetype pointer checks instead of `== null` / `!= null` to avoid
    // invoking user-defined @operator("==") overloads, which reject null arguments
    const actualIsNull = changetype<usize>(actual) == 0;
    const expectedIsNull = changetype<usize>(expected) == 0;

    if (actualIsNull && expectedIsNull) {
      return EqualityResult.Equal;
    }

    if (actualIsNull != expectedIsNull) {
      return EqualityResult.NotEqual;
    }
  }

  if (isArrayLike<T>(actual) && isArrayLike<U>(expected)) {
    return arrayEquals(actual, expected);
  }
  if (actual instanceof Set && expected instanceof Set) {
    return setEquals(actual, expected);
  }
  if (actual instanceof Map && expected instanceof Map) {
    return mapEquals(actual, expected);
  }
  if (actual instanceof ArrayBuffer && expected instanceof ArrayBuffer) {
    return arrayBufferEquals(actual, expected);
  }

  // Runtime type check via nameof with value arguments — returns the actual runtime
  // class name, catching both compile-time type differences (e.g. Circle vs Shape)
  // and polymorphic runtime differences (e.g. Shape-typed Circle vs Shape-typed Shape).
  // Without this guard, changetype in the compiler transform-injected deep equality
  // method would read past the smaller object's memory allocation, producing garbage
  // comparisons or false positives.
  if (nameof<T>(actual) != nameof<U>(expected)) {
    // @ts-ignore
    if (isDefined(actual.__vitest_assemblyscript_deep_equals)) {
      // User-defined classes: return TypeMismatch so the matcher can produce an
      // informative assertion failure message instead of an opaque error
      return EqualityResult.TypeMismatch;
    }
    // Non-user-defined types (containers, etc.): incompatible comparison is an error
    throw new Error("Cannot compare deep equality between " + nameof<T>(actual)
      + " and " + nameof<U>(expected)
    );
  }

  // @ts-ignore
  // User-defined reference types: delegate to compiler transform-injected deep equality
  // method. Uses hard-coded method name because using a variable like `actual[DEEP_EQ_FUNC]`
  // requires the class to define an index signature
  if (isDefined(actual.__vitest_assemblyscript_deep_equals)) {
    // @ts-ignore
    return actual.__vitest_assemblyscript_deep_equals(changetype<usize>(expected));
  }

  // Fall back to reference identity for types without deep equality method
  return changetype<usize>(actual) == changetype<usize>(expected)
    ? EqualityResult.Equal
    : EqualityResult.NotEqual;
}

/**
 * Global bridge for the deep-equals compiler transform.
 *
 * Injected deep equality methods in user classes call this function for per-field
 * comparisons. @global makes it available in all source files without import,
 * solving the afterParse import resolution limitation (injected import statements
 * are not processed by the AS compiler).
 *
 * Returns EqualityResult so injected methods can propagate type mismatch information
 * from nested comparisons back to the top-level matcher.
 *
 * Loaded into the compilation transitively: user test imports
 * vitest-pool-assemblyscript/assembly → index.ts → compare.ts.
 */
// @ts-ignore: AS-specific @global decorator
@global
function __vitest_assemblyscript_compare_equals<T, U>(actual: T, expected: U): EqualityResult {
  return equals<T, U>(actual, expected);
}

export enum InequalityOperation {
  LessThan,
  LessThanOrEqual,
  GreaterThan,
  GreaterThanOrEqual,
}

/**
 * Applies an inequality operation to two values of the same promoted type.
 * Handles <, <=, >, >= for any type that supports these operators (numbers, strings).
 */
function applyInequalityOp<T>(a: T, b: T, op: InequalityOperation): bool {
  if (op == InequalityOperation.LessThan) return a < b;
  if (op == InequalityOperation.LessThanOrEqual) return a <= b;
  if (op == InequalityOperation.GreaterThan) return a > b;
  return a >= b; // GreaterThanOrEqual
}

/**
 * Generic inequality comparison. Promotes both values to a common type and applies
 * the requested inequality operation.
 *
 * Strings are compared lexicographically. Booleans are treated as integers (true=1, false=0).
 * Non-string references are not comparable and throw an error.
 *
 * Cross-sign integer comparisons are supported (more permissive than AS's own operators)
 * via signed-negative early return + u64 promotion. Float/integer combinations where the
 * float's mantissa cannot losslessly represent the integer type's range are rejected,
 * matching AS compiler behavior. See docs/matcher-research.md for details.
 */
export function compareInequality<T, U>(actual: T, compareTo: U, expectedOperation: InequalityOperation): bool {
  // --- Strings: lexicographic comparison ---
  if (isString<T>() && isString<U>()) {
    // Guard against null before casting, mirroring identical()'s pattern
    const actualIsNull = isNullable<T>() && actual == null;
    const compareToIsNull = isNullable<U>() && compareTo == null;
    if (actualIsNull || compareToIsNull) {
      throw new Error(
        "Cannot compare null string with inequality operators: the result is undefined."
        + " Use toBeNull() to check for null values."
      );
    }
    return applyInequalityOp(<string>actual, <string>compareTo, expectedOperation);
  }

  // --- Reject non-string references (objects, arrays, etc.) ---
  if (isReference<T>() || isReference<U>()) {
    throw new Error(
      "Inequality comparison is not supported for " + nameof<T>() + " and " + nameof<U>()
      + ". Only numeric types and strings can be compared with inequality matchers."
    );
  }

  // --- Float/integer precision-loss rejection ---
  // Reject combinations where the float's mantissa cannot losslessly represent
  // the integer type's full range (sizeof(integer) >= sizeof(float)).
  // This mirrors AS's own operator rejection (e.g. f32 > i32, f64 > i64).
  if (isFloat<T>() && isInteger<U>()) {
    if (sizeof<U>() >= sizeof<T>()) {
      throw new Error(
        "Cannot compare " + nameof<T>() + " with " + nameof<U>()
        + ": float precision is insufficient for the integer type's range."
        + " Cast both values to f64 before comparing, e.g. expect(f64(a)).toBeGreaterThan(f64(b))."
        + " Note: large integer values may lose precision when cast to f64, which could cause false positives."
      );
    }
  } else if (isInteger<T>() && isFloat<U>()) {
    if (sizeof<T>() >= sizeof<U>()) {
      throw new Error(
        "Cannot compare " + nameof<T>() + " with " + nameof<U>()
        + ": float precision is insufficient for the integer type's range."
        + " Cast both values to f64 before comparing, e.g. expect(f64(a)).toBeGreaterThan(f64(b))."
        + " Note: large integer values may lose precision when cast to f64, which could cause false positives."
      );
    }
  }

  // --- Numeric comparisons ---
  // Booleans flow through here naturally (isInteger<bool>() is true in AS).

  if (isInteger<T>() && isInteger<U>()) {
    // Both signed → promote to i64
    if (isSigned<T>() && isSigned<U>()) {
      return applyInequalityOp(i64(actual), i64(compareTo), expectedOperation);
    }

    // Both unsigned → promote to u64
    if (!isSigned<T>() && !isSigned<U>()) {
      return applyInequalityOp(u64(actual), u64(compareTo), expectedOperation);
    }

    // Mixed sign — more permissive than AS, which rejects these at compile time.
    // If the signed value is negative, the result is deterministic: signed < unsigned.
    if (isSigned<T>() && !isSigned<U>()) {
      if (i64(actual) < 0) {
        // actual (signed negative) is always less than compareTo (unsigned)
        return expectedOperation == InequalityOperation.LessThan
            || expectedOperation == InequalityOperation.LessThanOrEqual;
      }
      return applyInequalityOp(u64(actual), u64(compareTo), expectedOperation);
    } else {
      // !isSigned<T>() && isSigned<U>()
      if (i64(compareTo) < 0) {
        // compareTo (signed negative) is always less than actual (unsigned)
        return expectedOperation == InequalityOperation.GreaterThan
            || expectedOperation == InequalityOperation.GreaterThanOrEqual;
      }
      return applyInequalityOp(u64(actual), u64(compareTo), expectedOperation);
    }
  }

  // Both floats → promote to f64
  if (isFloat<T>() && isFloat<U>()) {
    return applyInequalityOp(f64(actual), f64(compareTo), expectedOperation);
  }

  // Supported float/integer combo (passed precision-loss check above) → promote to f64
  if ( (isFloat<T>() && isInteger<U>()) || (isInteger<T>() && isFloat<U>()) ) {
    return applyInequalityOp(f64(actual), f64(compareTo), expectedOperation);
  }

  // Unsupported type combination (e.g. vectors)
  throw new Error(
    "Inequality comparison is not supported for " + nameof<T>() + " and " + nameof<U>() + "."
  );
}

export function truthyOrFalsey<T>(actual: T, expected: bool): bool {
  return actual ? expected == true : expected == false;
}

export function isNull<T>(value: T): bool {
  if (isReference<T>()) {
    if (isNullable<T>()) {
      return value == null;
    } else {
      return false;
    }
  } else {
    if (isBoolean<T>()) {
      return false;
    } else if (isVector<T>()) {
      return false;
    } else {
      return nameof<T>(value) == 'usize' && value == 0;
    }
  }
}

export function nan<T>(value: T): bool {
  if (isFloat<T>()) {
    // @ts-ignore
    return isNaN<T>(value);
  } else {
    return false;
  }
}
