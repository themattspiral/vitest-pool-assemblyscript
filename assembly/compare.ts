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

function setEquals<T extends Set<V>, U extends Set<V>, V>(actual: T, expected: U): bool {
  if (actual.size != expected.size) {
    return false;
  }

  const expectedValues: V[] = expected.values();

  for (let i = 0; i < expectedValues.length; i++) {
    if (!actual.has(expectedValues[i])) {
      return false;
    }
  }

  return true;
}

function mapEquals<
  T extends Map<V, W>,
  U extends Map<V, W>,
  V, W
>(actual: T, expected: U): bool {
  if (actual.size != expected.size) {
    return false;
  }
  
  const expectedKeys: V[] = expected.keys();

  for (let i = 0; i < expectedKeys.length; i++) {
    const key: V = expectedKeys[i];
    
    if (!actual.has(key)) {
      return false;
    }

    if (!equals<W, W>(actual.get(key), expected.get(key))) {
      return false;
    }
  }

  return true;
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

  // TODO value compare
  throw new Error("Comparison of user-defined object types not yet implemented");
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
