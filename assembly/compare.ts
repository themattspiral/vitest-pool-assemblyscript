function arrayEquals<T extends ArrayLike<unknown>, U extends ArrayLike<unknown>>(actual: T, expected: U): bool {
  if (actual.length != expected.length) {
    return false;
  }

  for (let i = 0; i < expected.length; i++) {
    if (!equals(actual[i], expected[i])) {
      return false;
    }
  }

  return true;
}

function setEquals<T, U>(actual: T, expected: U): bool {
  if (actual instanceof Set && expected instanceof Set) {
    if (actual.size != expected.size) {
      return false;
    }

    const expectedValues = expected.values();

    for (let i = 0; i < expectedValues.length; i++) {
      if (!actual.has(expectedValues[i])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function mapEquals<T, U>(actual: T, expected: U): bool {
  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size != expected.size) {
      return false;
    }

    const expectedKeys = expected.keys();

    for (let i = 0; i < expectedKeys.length; i++) {
      const key = expectedKeys[i];

      if (!actual.has(key)) {
        return false;
      }

      if (!equals(actual.get(key), expected.get(key))) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Generic primitive / reference equality comparison. Assumes comparable primitive types
 * (or same reference type) for provided values.
 */
export function identical<T, U>(actual: T, expected: U): bool {
  // both refs
  if (isReference<T>() && isReference<U>()) {
    const actualIsNullable = isNullable<T>();
    const actualIsNull = actualIsNullable && actual == null;
    const expectedIsNullable = isNullable<U>();
    const expectedIsNull = expectedIsNullable && expected == null;
    
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
 * Does not yet support user-defined types.
 */
export function equals<T, U>(actual: T, expected: U): bool {
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
    return exactMatch;
  } else if (exactMatch) {
    // primitive / reference comparison passed already
    return true;
  }

  if (isNullable<T>()) {
    if (actual == null && expected == null) {
      return true;
    }

    if ( (actual == null && expected != null) || (actual != null && expected == null) ) {
      return false;
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

  if (idof<T>() != idof<U>()) {
    throw new Error("Cannot compare equality between " + nameof<T>(actual)
      + " and " + nameof<U>(expected) + " - this comparison is undefined."
    );
  }

  // TODO value compare
  throw new Error("Deep equality comparison of user-defined reference types"
    + " is not yet implemented, and these references are not identical."
    + " Use toBe() for reference equality."
  );
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
