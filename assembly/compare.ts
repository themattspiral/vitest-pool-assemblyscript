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
  if (isNullable<T>() && actual == null && expected == null) {
    return true;
  }

  if (isReference<T>(actual) && isReference<U>(expected)) {
    if (isString<T>(actual) && isString<U>(expected)) {
      return <string>actual == <string>expected;
    } else {
      return changetype<usize>(actual) == changetype<usize>(expected);
    }
  } else {
    if (isInteger<T>(actual) && isInteger<U>(expected)) {
      const actualSigned = isSigned<T>(actual);
      const expectedSigned = isSigned<U>(expected);

      if (actualSigned && expectedSigned) {
        return i64(actual) == i64(expected);
      } else if (!actualSigned && !expectedSigned) {
        return u64(actual) == u64(expected);
      } else if (actualSigned && !expectedSigned) {
        if (actual < 0) {
          return false;
        }
        return u64(actual) == u64(expected);
      } else {
        if (expected < 0) {
          return false;
        }
        return u64(actual) == u64(expected);
      }
    } else if (isFloat<T>(actual) && isFloat<U>(expected)) {
      return f64(actual) === f64(expected);
    } else if ( (isFloat<T>(actual) && isInteger<U>(expected)) || (isInteger<T>(actual) && isFloat<U>(expected)) ) {
      return f64(actual) === f64(expected);
    } else if (isVector<T>(actual) && isVector<U>(expected)) {
      return <v128>actual == <v128>expected;
    } else {
      return false;
    } 
  }
}

export function closeTo<T, U>(actual: T, expected: U, precision: i32 = 2): bool {
  const exactMatch = identical(actual, expected);
  if (exactMatch) {
    return true;
  }

  if ( (isInteger<T>(actual) && isInteger<U>(expected)) || (isString<T>(actual) && isString<U>(expected)) ) {
    return exactMatch;
  }
  
  if (isFloat<T>(actual) || isFloat<U>(expected)) {
    const actualF64: f64 = f64(actual);
    const expectedF64: f64 = f64(expected);
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
  const exactMatch = identical(actual, expected);

  if (!isReference<T>() || isString<T>() || isVector<T>()) {
    // primitive or string: return result of comparing
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

