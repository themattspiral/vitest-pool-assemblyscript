import { isNull, stringifyValue } from './utils';

/**
 * Byte offset from an object pointer to the rtId field in the AS managed object header.
 * Every managed object has a 20-byte header preceding the payload; rtId is a u32 at offset -8.
 * See: https://www.assemblyscript.org/runtime.html#memory-layout
 */
const MANAGED_OBJECT_RTID_BYTE_OFFSET: usize = 8;

/**
 * Cycle detection for deep equality comparisons. Tracks which (actual, expected) reference
 * pairs are currently being compared to prevent infinite recursion on self-referential or
 * mutually-referential object graphs.
 *
 * Pairs are packed as u64 keys: (u64(actualPtr) << 32) | u64(expectedPtr).
 * Entries are added when a reference comparison starts and never individually removed —
 * if a pair was previously Equal, revisiting returns Equal (correct); if NotEqual, we
 * already returned and won't revisit. Cleared at the start of each toEqual/toStrictEqual call.
 */
const equalsRefPairs = new Set<u64>();

function equalsRefPairSeen(actualPtr: usize, expectedPtr: usize): bool {
  const key: u64 = (u64(actualPtr) << 32) | u64(expectedPtr);
  return equalsRefPairs.has(key);
}

function equalsRefPairMark(actualPtr: usize, expectedPtr: usize): void {
  const key: u64 = (u64(actualPtr) << 32) | u64(expectedPtr);
  equalsRefPairs.add(key);
}

export function equalsRefPairsClear(): void {
  equalsRefPairs.clear();
}

/**
 * Comparison path tracking for deep equality. Accumulates path segments (e.g. "[0]",
 * "['key']", "{Set}") as equals() recurses into containers, building a path like
 * "[2].name" from root to the mismatch point.
 *
 * Uses push/pop discipline: pop only on Equal, return-without-pop on non-Equal.
 * As non-Equal propagates up the call stack, the path naturally accumulates to the
 * deepest mismatch point. Cleared at the start of each toEqual/toStrictEqual call.
 */
const equalsPath: string[] = [];

function equalsPathPush(segment: string): void {
  equalsPath.push(segment);
}

function equalsPathPop(): void {
  equalsPath.pop();
}

export function equalsPathString(): string {
  let result = "";
  for (let i = 0; i < equalsPath.length; i++) {
    result += equalsPath[i];
  }
  return result;
}

export function equalsPathClear(): void {
  equalsPath.length = 0;
}

export function equalsPathLength(): i32 {
  return equalsPath.length;
}

/**
 * Runtime type mismatch name tracking. When equals() detects a runtime type mismatch
 * (different rtIds on managed objects), it captures the actual and expected runtime type
 * names via the transform-injected __vitest_assemblyscript_typename method. These are
 * read by toEqual/toStrictEqual/toContainEqual to include type names in the assertion suffix
 * (e.g. "runtime type mismatch: Circle vs Square").
 *
 * Cleared at the start of each toEqual/toStrictEqual call alongside path and visited set.
 */
let equalsRtmActualName: string = "";
let equalsRtmExpectedName: string = "";

export function equalsRtmNamesSuffix(): string {
  if (equalsRtmActualName != "" && equalsRtmExpectedName != "") {
    return ": " + equalsRtmActualName + " vs " + equalsRtmExpectedName;
  }
  return "";
}

export function equalsRtmNamesClear(): void {
  equalsRtmActualName = "";
  equalsRtmExpectedName = "";
}

/**
 * Global bridge for the deep-equals compiler transform — push a path segment.
 *
 * Transform-injected deep equality methods call this to record which field is
 * being compared, enabling path context like ".shape" or ".members" in error messages.
 * Declared global to make it available in all source files without import.
 */
// @ts-ignore: top level decorators are supported in AssemblyScript
@global
function __vitest_assemblyscript_compare_equals_path_push(segment: string): void {
  equalsPathPush(segment);
}

/**
 * Global bridge for the deep-equals compiler transform — pop a path segment.
 *
 * Called only when a field comparison returns Equal (push/pop discipline).
 * On non-Equal, the segment is left on the stack so the path accumulates
 * to the deepest mismatch point.
 */
// @ts-ignore: top level decorators are supported in AssemblyScript
@global
function __vitest_assemblyscript_compare_equals_path_pop(): void {
  equalsPathPop();
}

/** Returns " at <path>" or " within <path>" if the path is non-empty, otherwise empty string. */
function equalsPathAtSuffix(): string {
  if (equalsPath.length == 0) return "";

  // Scan for "Set" anywhere in the path stack. Set elements have no meaningful
  // identifier, so segments pushed after "Set" (e.g. array indices from inner
  // comparisons during the set scan) are discarded — they represent aborted
  // comparison attempts whose segments couldn't be cleaned up because a throw
  // halted execution. Build the path only up to and including "Set".
  for (let i = equalsPath.length - 1; i >= 0; i--) {
    if (equalsPath[i] == "Set") {
      let path = "";
      for (let j = 0; j <= i; j++) {
        path += equalsPath[j];
      }
      return " within " + path;
    }
  }

  return " at " + equalsPathString();
}

/**
 * Result of a deep equality comparison.
 * Declared global so it is available in all source files without import —
 * including transform-injected deep equality methods in user classes.
 */
// @ts-ignore: top level decorators are supported in AssemblyScript
@global
export enum __vitest_assemblyscript_EqualityResult {
  Equal,
  NotEqual,
  RuntimeTypeMismatch,
}

function arrayEquals<T extends ArrayLike<unknown>, U extends ArrayLike<unknown>>(actual: T, expected: U): __vitest_assemblyscript_EqualityResult {
  if (actual.length != expected.length) {
    return __vitest_assemblyscript_EqualityResult.NotEqual;
  }

  for (let i = 0; i < expected.length; i++) {
    // Context-aware format: "[N]" composes with field paths (e.g. ".members[2]"),
    // "index [N]" reads well standalone (e.g. "differs at index [2]")
    const segment = equalsPathLength() > 0
      ? "[" + i.toString() + "]"
      : "index [" + i.toString() + "]";
    equalsPathPush(segment);
    const result = equals(actual[i], expected[i]);
    if (result != __vitest_assemblyscript_EqualityResult.Equal) {
      return result;
    }
    equalsPathPop();
  }

  return __vitest_assemblyscript_EqualityResult.Equal;
}

function setEquals<T, U>(actual: T, expected: U): __vitest_assemblyscript_EqualityResult {
  if (actual instanceof Set && expected instanceof Set) {
    // Exception to push/pop discipline: always pop before returning, regardless of result.
    // Set elements have no meaningful identifier (no index, no key), so "Set" is only
    // useful as a terminal path segment — it should not compose with deeper segments
    // from recursive comparisons inside elements. equalsPathAtSuffix() formats this
    // as "within Set" instead of "at Set".
    equalsPathPush("Set");

    if (actual.size != expected.size) {
      equalsPathPop();
      return __vitest_assemblyscript_EqualityResult.NotEqual;
    }

    const actualValues = actual.values();
    const expectedValues = expected.values();

    // Track which actual elements have been matched to prevent double-counting.
    // Without this, two expected elements could both match the same actual element.
    const matched = new Array<bool>(actualValues.length);
    for (let i = 0; i < matched.length; i++) {
      matched[i] = false;
    }

    for (let i = 0; i < expectedValues.length; i++) {
      let found = false;
      for (let j = 0; j < actualValues.length; j++) {
        if (!matched[j]) {
          // Save path stack depth before each scan attempt. Failed comparisons
          // leave stale segments (e.g. ".x" from a Point field) that would corrupt
          // the pop discipline — restoring ensures "Set" remains the top segment.
          const pathDepth = equalsPathLength();
          if (equals(actualValues[j], expectedValues[i]) == __vitest_assemblyscript_EqualityResult.Equal) {
            matched[j] = true;
            found = true;
            break;
          }
          equalsPath.length = pathDepth;
        }
      }
      if (!found) {
        equalsPathPop();
        return __vitest_assemblyscript_EqualityResult.NotEqual;
      }
    }

    equalsPathPop();
    return __vitest_assemblyscript_EqualityResult.Equal;
  }

  return __vitest_assemblyscript_EqualityResult.NotEqual;
}

function mapEquals<T, U>(actual: T, expected: U): __vitest_assemblyscript_EqualityResult {
  if (actual instanceof Map && expected instanceof Map) {
    // Key types must match exactly — cross-type key comparison is not safe because
    // .has() and .get() depend on the key's hash and equality semantics, which differ
    // across types (e.g. string vs i32 keys have incompatible hash/lookup behavior).
    // @ts-ignore
    if (nameof<indexof<T>>() != nameof<indexof<U>>()) {
      throw new Error("Map key types must match for deep equality comparison: "
        + nameof<T>() + " and " + nameof<U>()
        + equalsPathAtSuffix()
      );
    }

    if (actual.size != expected.size) {
      return __vitest_assemblyscript_EqualityResult.NotEqual;
    }

    // Cast actual to use expected's key type (verified equal above) while preserving
    // actual's native value type. This lets us iterate expected's keys and look them
    // up in actual, while equals() handles cross-type value comparison naturally
    // (e.g. valueof<T>=i32 vs valueof<U>=f64).
    // @ts-ignore
    const castActual = changetype<Map<indexof<U>, valueof<T>>>(actual);

    // instanceof needed after changetype for the compiler to resolve Map methods
    if (castActual instanceof Map) {
      const expectedKeys = expected.keys();

      for (let i = 0; i < expectedKeys.length; i++) {
        const key = expectedKeys[i];
        // Context-aware format: "[key]" composes with field paths (e.g. ".registry[\"x\"]"),
        // "key [key]" reads well standalone (e.g. "differs at key [\"x\"]")
        const segment = equalsPathLength() > 0
          ? "[" + stringifyValue(key) + "]"
          : "key [" + stringifyValue(key) + "]";
        equalsPathPush(segment);

        if (!castActual.has(key)) {
          return __vitest_assemblyscript_EqualityResult.NotEqual;
        }

        // Cross-type value comparison delegates to equals(), which handles
        // compatible numeric types, incomparable types, and precision-loss cases
        const result = equals(castActual.get(key), expected.get(key));
        if (result != __vitest_assemblyscript_EqualityResult.Equal) {
          return result;
        }
        equalsPathPop();
      }

      return __vitest_assemblyscript_EqualityResult.Equal;
    } else {
      // will never happen — changetype preserves the underlying Map instance
      unreachable();
    }
  }

  return __vitest_assemblyscript_EqualityResult.NotEqual;
}

function arrayBufferEquals<T, U>(actual: T, expected: U): __vitest_assemblyscript_EqualityResult {
  if (!(actual instanceof ArrayBuffer) || !(expected instanceof ArrayBuffer)) {
    return __vitest_assemblyscript_EqualityResult.NotEqual;
  }

  if (actual.byteLength != expected.byteLength) {
    return __vitest_assemblyscript_EqualityResult.NotEqual;
  }

  const actualPtr = changetype<usize>(actual);
  const expectedPtr = changetype<usize>(expected);
  const wordCount: usize = actual.byteLength / 8;
  const remainder: usize = actual.byteLength % 8;

  // compare 8 bytes at a time (u64 word-sized comparison)
  for (let i: usize = 0; i < wordCount; i++) {
    if (load<u64>(actualPtr + i * 8) != load<u64>(expectedPtr + i * 8)) {
      return __vitest_assemblyscript_EqualityResult.NotEqual;
    }
  }

  // compare remaining 0-7 bytes individually
  const remainderOffset = wordCount * 8;
  for (let i: usize = 0; i < remainder; i++) {
    if (load<u8>(actualPtr + remainderOffset + i) != load<u8>(expectedPtr + remainderOffset + i)) {
      return __vitest_assemblyscript_EqualityResult.NotEqual;
    }
  }

  return __vitest_assemblyscript_EqualityResult.Equal;
}

function arrayContains<T extends ArrayLike<unknown>, U>(actual: T, expected: U, useEquals: bool): __vitest_assemblyscript_EqualityResult {
  for (let i = 0; i < actual.length; i++) {
    if (useEquals) {
      // The index segment provides path context if equals() throws for a genuinely
      // incomparable element type (e.g. "Cannot compare Shape with i32 at index [0]").
      // Format: "[N]" composes with outer field paths, "index [N]" reads standalone.
      const pathDepth = equalsPathLength();
      const segment = pathDepth > 0
        ? "[" + i.toString() + "]"
        : "index [" + i.toString() + "]";
      equalsPathPush(segment);

      // Only an exact deep match counts as containment. A runtime type mismatch means
      // this element simply isn't the value being searched for, so we keep scanning — a
      // per-element type mismatch is a property of that one comparison, not of the search,
      // and surfacing one from a one-to-many scan would be arbitrary. (equals() still
      // throws for genuinely incomparable types, which propagates with the path context.)
      if (equals(actual[i], expected) == __vitest_assemblyscript_EqualityResult.Equal) {
        return __vitest_assemblyscript_EqualityResult.Equal;
      }

      // Restore the stack to its pre-element depth. A failed deep comparison can leave an
      // arbitrary number of nested segments behind; truncating to the saved depth clears
      // them all regardless of nesting, mirroring arrayEquals' scan discipline.
      equalsPath.length = pathDepth;
    }

    if (!useEquals && identical(actual[i], expected)) {
      return __vitest_assemblyscript_EqualityResult.Equal;
    }
  }

  return __vitest_assemblyscript_EqualityResult.NotEqual;
}

function setContains<T, U>(actual: T, expected: U, useEquals: bool): __vitest_assemblyscript_EqualityResult {
  if (actual instanceof Set) {
    // toContain mirrors the set's native membership op (Set.has), which is type-exact. When the
    // expected type differs from the element type we throw rather than walking: a cross-type walk
    // would let toContain pass where the user's own set.has(value) cannot even be expressed
    // without a cast, which misleads about what their real code can find. toContainEqual is free
    // to walk cross-type because there is no native deep-membership op for it to contradict.
    // @ts-ignore - TS can't see that Set is indexable for type extraction
    if (!useEquals && nameof<indexof<T>>() != nameof<U>()) {
      throw new Error(
        "A " + nameof<T>() + " cannot contain a value of type " + nameof<U>()
        + ". Use toContainEqual() to do a cross-type Set membership check."
      );
    }
    
    if (useEquals) {
      // "Set" gives throw context if equals() throws for an incomparable element type.
      equalsPathPush("Set");

      const vals = actual.values();

      for (let i = 0; i < vals.length; i++) {
        // Only an exact deep match counts; a runtime type mismatch just means "not this
        // element, keep scanning" (see arrayContains for the rationale).
        const pathDepth = equalsPathLength();
        if (equals(vals[i], expected) == __vitest_assemblyscript_EqualityResult.Equal) {
          equalsPathPop();
          return __vitest_assemblyscript_EqualityResult.Equal;
        }
        // Clear any nested segments a failed comparison left, keeping "Set" on top.
        equalsPath.length = pathDepth;
      }

      equalsPathPop();
      return __vitest_assemblyscript_EqualityResult.NotEqual;
    } else {
      // cast the set for looking up expected (casting expected may cause compile errors)
      const castActual = changetype<Set<U>>(actual);
      
      if (castActual instanceof Set) {
        // @ts-ignore
        return castActual.has(expected)
          ? __vitest_assemblyscript_EqualityResult.Equal
          : __vitest_assemblyscript_EqualityResult.NotEqual;
      }
    }
  }
  
  return __vitest_assemblyscript_EqualityResult.NotEqual;
}

function mapContains<T, U>(actual: T, expected: U, useEquals: bool): __vitest_assemblyscript_EqualityResult {
  if (actual instanceof Map) {
    if (expected instanceof MapEntry) {
      // @ts-ignore
      if (nameof<indexof<T>>() != nameof<indexof<U>>()) {
        // @ts-ignore
        throw new Error("A " + nameof<T>() + " cannot contain an entry with key of type " + nameof<indexof<U>>());
      }

      // cast the map for looking up expected (casting expected may cause compile errors)
      // @ts-ignore
      const castActual = changetype<Map<indexof<U>, valueof<T>>>(actual);

      const hasKey = castActual.has(expected.entryKey);
      if (hasKey && useEquals) {
        // The key segment gives throw context if the value comparison throws for an
        // incomparable type. Format: "[key]" composes with field paths (e.g.
        // ".registry[\"x\"]"), "key [key]" reads well standalone.
        const pathDepth = equalsPathLength();
        const segment = pathDepth > 0
          ? "[" + stringifyValue(expected.entryKey) + "]"
          : "key [" + stringifyValue(expected.entryKey) + "]";
        equalsPathPush(segment);

        // Only an exact deep match counts; a runtime type mismatch means the value is
        // not equal, so the entry is not present (see arrayContains for the rationale).
        const isEqual = equals(castActual.get(expected.entryKey), expected.entryVal)
          == __vitest_assemblyscript_EqualityResult.Equal;
        equalsPath.length = pathDepth;

        return isEqual
          ? __vitest_assemblyscript_EqualityResult.Equal
          : __vitest_assemblyscript_EqualityResult.NotEqual;
      }
      if (hasKey && !useEquals) {
        return identical(castActual.get(expected.entryKey), expected.entryVal)
          ? __vitest_assemblyscript_EqualityResult.Equal
          : __vitest_assemblyscript_EqualityResult.NotEqual;
      }
    } else if (isArrayLike<U>(expected)) {
      if (expected.length != 2) {
        throw new Error(
          "Membership in a Map is ambiguous with " + expected.length.toString() + "-item array."
          + " \nCheck for a matching key-value entry with a 2-item array: expect(map).toContain([key, value])"
          + " \nOr alternatively use the entry() helper: expect(map).toContain(entry(key, value))"
        );
      }

      // @ts-ignore
      if (nameof<indexof<T>>() != nameof<valueof<U>>()) {
        // @ts-ignore
        throw new Error("A " + nameof<T>() + " cannot contain an entry with key of type " + nameof<valueof<U>>());
      }

      // cast the set for looking up expected (casting expected may cause compile errors)
      // @ts-ignore
      const castActual = changetype<Map<valueof<U>, valueof<T>>>(actual);

      const hasKey = castActual.has(expected[0]);
      if (hasKey && useEquals) {
        // Only an exact deep match counts; a runtime type mismatch means the value is
        // not equal, so the entry is not present.
        return equals(castActual.get(expected[0]), expected[1]) == __vitest_assemblyscript_EqualityResult.Equal
          ? __vitest_assemblyscript_EqualityResult.Equal
          : __vitest_assemblyscript_EqualityResult.NotEqual;
      }
      if (hasKey && !useEquals) {
        return identical(castActual.get(expected[0]), expected[1])
          ? __vitest_assemblyscript_EqualityResult.Equal
          : __vitest_assemblyscript_EqualityResult.NotEqual;
      }
    } else {
      throw new Error(
        "Membership in a Map is ambiguous between keys and values."
        + " \nCheck for a key: expect(map.has(key)).toBeTruthy()"
        + " \nCheck a value at a known key: expect(map.get(key)).toBe(value) / .toEqual(value)"
        + " \nCheck for a matching key-value entry: expect(map).toContain(entry(key, value)) / .toContainEqual(entry(key, value))"
      );
    }

    return __vitest_assemblyscript_EqualityResult.NotEqual;
  }

  return __vitest_assemblyscript_EqualityResult.NotEqual;
}

/**
 * Generic primitive / reference equality comparison. Assumes comparable primitive types
 * (or same reference type) for provided values.
 */
export function identical<T, U>(actual: T, expected: U): bool {
  const actualIsNull = isNull(actual);
  const expectedIsNull = isNull(expected);

  // both refs
  if (isReference<T>() && isReference<U>()) {
    // null refs
    if (actualIsNull && expectedIsNull) {
      return true;
    } else if ( actualIsNull != expectedIsNull ) {
      return false;
    }

    // strings
    if (isString<T>() && isString<U>()) {
      return <string>actual == <string>expected;
    } else {
      // object refs
      return changetype<usize>(actual) == changetype<usize>(expected);
    }
  } else if (
      (isReference<T>() && !isReference<U>())
      || (!isReference<T>() && isReference<U>())
    ) {
    if (actualIsNull && expectedIsNull) {
      return true;
    } else if ( actualIsNull != expectedIsNull ) {
      return false;
    }

    // Non-null reference vs value type: fundamentally incomparable
    throw new Error(
      "Cannot compare " + nameof<T>() + " with " + nameof<U>()
      + equalsPathAtSuffix() + ": reference and value types are not comparable."
    );
  } else { // both primitives
    if ( actualIsNull != expectedIsNull ) {
      return false;
    }

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
            + equalsPathAtSuffix()
            + ": float precision is insufficient for the integer type's range."
            + " Cast both values to f64 before comparing, e.g. expect(f64(a)).toBe(f64(b))."
            + " Note: large integer values may lose precision when cast to f64, which could cause false positives."
          );
        }
      } else {
        if (sizeof<T>() >= sizeof<U>()) {
          throw new Error(
            "Cannot compare " + nameof<T>() + " with " + nameof<U>()
            + equalsPathAtSuffix()
            + ": float precision is insufficient for the integer type's range."
            + " Cast both values to f64 before comparing, e.g. expect(f64(a)).toBe(f64(b))."
            + " Note: large integer values may lose precision when cast to f64, which could cause false positives."
          );
        }
      }

      // if we got here, cast to f64 is safe without precision loss - cast to compare
      return f64(actual) === f64(expected);
    } else if (isVector<T>() && isVector<U>()) {
      return <v128>actual == <v128>expected;
    } else {
      throw new Error(
        "Cannot compare " + nameof<T>() + " with " + nameof<U>()
        + equalsPathAtSuffix() + ": incompatible types."
      );
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
 * Returns an __vitest_assemblyscript_EqualityResult enum to distinguish between "not equal" and "type mismatch",
 * enabling matchers to produce more informative assertion failure messages.
 */
export function equals<T, U>(actual: T, expected: U): __vitest_assemblyscript_EqualityResult {
  let exactMatch: bool = false;

  // allow boolean-to-number comparisons here
  if (isBoolean<T>() && !isBoolean<U>()) {
    exactMatch = identical(u8(actual), expected);
  } else if (!isBoolean<T>() && isBoolean<U>()) {
    exactMatch = identical(actual, u8(expected));
  } else {
    exactMatch = identical(actual, expected);
  }

  const actualIsNull = isNull(actual);
  const expectedIsNull = isNull(expected);

  if (
    (!isReference<T>() && !isReference<U>())
    || (isString<T>() && isString<U>())
    || (isVector<T>() && isVector<U>())
  ) {
    // non-bool primitives or strings or vectors: return result of identity compare
    return exactMatch ? __vitest_assemblyscript_EqualityResult.Equal : __vitest_assemblyscript_EqualityResult.NotEqual;
  } else if (exactMatch) {
    // primitive / reference comparison passed already
    return __vitest_assemblyscript_EqualityResult.Equal;
  } else if (
    (isReference<T>() && !isReference<U>())
    || (!isReference<T>() && isReference<U>())
  ) {
    if (actualIsNull || expectedIsNull) {
      return exactMatch ? __vitest_assemblyscript_EqualityResult.Equal : __vitest_assemblyscript_EqualityResult.NotEqual;
    }

    // Non-null reference vs value type: fundamentally incomparable
    throw new Error(
      "Cannot compare " + nameof<T>() + " with " + nameof<U>()
      + equalsPathAtSuffix() + ": reference and value types are not comparable."
    );
  }

  if (actualIsNull && expectedIsNull) {
    return __vitest_assemblyscript_EqualityResult.Equal;
  }
  if (actualIsNull != expectedIsNull) {
    return __vitest_assemblyscript_EqualityResult.NotEqual;
  }

  // Cycle detection: if this reference pair is already being compared further up
  // the call stack, the cycle structure matches — any field-level differences would
  // have been caught in the non-cyclic part before reaching the cycle.
  const actualPtr = changetype<usize>(actual);
  const expectedPtr = changetype<usize>(expected);
  if (equalsRefPairSeen(actualPtr, expectedPtr)) {
    return __vitest_assemblyscript_EqualityResult.Equal;
  }
  equalsRefPairMark(actualPtr, expectedPtr);

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

  // Runtime type checking for reference types.
  // Managed objects have a header with rtId (runtime type ID) that reflects the actual
  // runtime type, even when the variable is declared as a base type. Unmanaged objects
  // lack this header and fall back to compile-time idof checks.
  if (isManaged<T>() != isManaged<U>()) {
    // Managed vs unmanaged is a fundamental memory layout incompatibility
    throw new Error("Cannot compare deep equality between managed and unmanaged types: "
      + nameof<T>() + " and " + nameof<U>()
      + equalsPathAtSuffix()
    );
  }

  if (isManaged<T>() && isManaged<U>()) {
    // Both managed: read runtime type ID from the AS object header
    const actualRtId = load<u32>(changetype<usize>(actual) - MANAGED_OBJECT_RTID_BYTE_OFFSET);
    const expectedRtId = load<u32>(changetype<usize>(expected) - MANAGED_OBJECT_RTID_BYTE_OFFSET);

    if (actualRtId != expectedRtId) {
      // @ts-ignore
      if (isDefined(actual.__vitest_assemblyscript_deep_equals)) {
        // User-defined classes: return TypeMismatch so the matcher can produce an
        // informative assertion failure message instead of an opaque error.
        //
        // We return here instead of throwing to support `.not.toEqual()` for
        // polymorphic runtime type mismatches — e.g. a Shape-typed Circle vs
        // Shape-typed Square, where asserting "not equal" is valid, not a
        // programmer error. In `toEqual`, `equals()` is called BEFORE
        // `assertComparison()`. If `equals()` throws, execution never reaches
        // `assertComparison`, so `.not` inversion cannot run and the test
        // crashes. By returning TypeMismatch, `toEqual` evaluates
        // `result == __vitest_assemblyscript_EqualityResult.Equal` (false), passes that to
        // `assertComparison`, and `.not` can invert it to a pass.

        // Capture runtime type names via virtual dispatch for informative assertion suffix
        // @ts-ignore
        if (isDefined(actual.__vitest_assemblyscript_typename)) {
          // @ts-ignore
          equalsRtmActualName = (<NonNullable<T>>actual).__vitest_assemblyscript_typename();
        }
        // @ts-ignore
        if (isDefined(expected.__vitest_assemblyscript_typename)) {
          // @ts-ignore
          equalsRtmExpectedName = (<NonNullable<U>>expected).__vitest_assemblyscript_typename();
        }

        return __vitest_assemblyscript_EqualityResult.RuntimeTypeMismatch;
      }

      // Non-user-defined managed types with mismatched rtIds: cross-container comparisons
      // (e.g. Map vs Set, Array vs Map) that fell through the instanceof checks above
      // (which require both operands to be the same container type), or stdlib types
      throw new Error("Cannot compare deep equality between " + nameof<T>()
        + " and " + nameof<U>()
        + equalsPathAtSuffix()
      );
    }
  } else {
    // Both unmanaged: no object header or idof available, fall back to compile-time
    // nameof check. This is acceptable because unmanaged types don't participate in
    // virtual dispatch or polymorphic inheritance — the compile-time type is reliable.
    if (nameof<T>() != nameof<U>()) {
      // @ts-ignore
      if (isDefined(actual.__vitest_assemblyscript_deep_equals)) {
        // see both-managed case above: same reasoning here, just behind a different type check
        // Unmanaged types don't have virtual dispatch, so typename (if present) returns
        // compile-time names — consistent with how the type check itself works here.
        // @ts-ignore
        if (isDefined(actual.__vitest_assemblyscript_typename)) {
          // @ts-ignore
          equalsRtmActualName = (<NonNullable<T>>actual).__vitest_assemblyscript_typename();
        }
        // @ts-ignore
        if (isDefined(expected.__vitest_assemblyscript_typename)) {
          // @ts-ignore
          equalsRtmExpectedName = (<NonNullable<U>>expected).__vitest_assemblyscript_typename();
        }
        return __vitest_assemblyscript_EqualityResult.RuntimeTypeMismatch;
      }

      // see both-managed case above: handle potential mismatched type fallthrough
      // for unmanaged stdlib / container type mismatches
      throw new Error("Cannot compare deep equality between " + nameof<T>()
        + " and " + nameof<U>()
        + equalsPathAtSuffix()
      );
    }
  }

  // User-defined reference types: delegate to compiler transform-injected deep equality
  // method. Uses hard-coded method name because using a variable like `actual[DEEP_EQ_FUNC]`
  // requires the class to define an index signature.
  // Cast to NonNullable<T> because AS doesn't narrow nullability from the changetype-based
  // null checks above — it requires explicit type narrowing to call methods on nullable types.
  // Safe because both-null and one-null cases return early above.
  // @ts-ignore
  if (isDefined(actual.__vitest_assemblyscript_deep_equals)) {
    const nonNullActual = <NonNullable<T>>actual;
    // @ts-ignore
    return nonNullActual.__vitest_assemblyscript_deep_equals(changetype<usize>(expected));
  }

  // Fall back to reference identity for types without deep equality method
  return changetype<usize>(actual) == changetype<usize>(expected)
    ? __vitest_assemblyscript_EqualityResult.Equal
    : __vitest_assemblyscript_EqualityResult.NotEqual;
}

export class MapEntry<K,V> {
  entryKey: K;
  entryVal: V;

  constructor(key: K, value: V) {
    this.entryKey = key;
    this.entryVal = value;
  }

  // index getter syntax: instance[key]
  // lets us type check using indexof<MapEntry>
  @operator('[]')
  __get(k: K): V {
    return this.entryVal;
  }

  // index setter syntax: instance[key] = value
  // lets us type check using valueof<MapEntry>
  @operator('[]=')
  __set(k: K, v: V): void {
    this.entryKey = k;
    this.entryVal = v;
  }

  __vitest_assemblyscript_custom_stringify(
    formatForDiff: bool = true, depth: i32 = 0, budget: i32 = -1
  ): string {
    return "entry(" + stringifyValue(this.entryKey, false) + ", "
    + stringifyValue(this.entryVal, formatForDiff, depth, budget) + ")";
  }
}

export function contains<T, U>(actual: T, expected: U, useEquals: bool): __vitest_assemblyscript_EqualityResult {
  const actualIsNull = isNull(actual);
  const expectedIsNull = isNull(expected);

  if (actualIsNull) {
    throw new Error("Cannot determine if null contains a given value of type " + nameof<U>() + ".");
  }

  if (!isReference<T>()) {
    throw new Error("Cannot determine if type " + nameof<T>() + " contains a given value of type " + nameof<U>() + ".");
  }

  if (isString<T>()) {
    if (expectedIsNull) {
      throw new Error("Cannot determine if a String contains a null value.");
    }

    if (!isString<U>()) {
      throw new Error("Cannot determine if a String contains a given value of type " + nameof<U>() + ".");
    }
    
    return (<string>actual).includes(<string>expected)
      ? __vitest_assemblyscript_EqualityResult.Equal
      :__vitest_assemblyscript_EqualityResult.NotEqual;
  }

  const nonNullActual = <NonNullable<T>>actual;

  if (isArrayLike<T>(nonNullActual)) {
    return arrayContains(nonNullActual, expected, useEquals);
  }
  if (actual instanceof Set) {
    return setContains(actual, expected, useEquals);
  }
  if (actual instanceof Map) {
    return mapContains(actual, expected, useEquals);
  }
  if (actual instanceof ArrayBuffer) {
    // An ArrayBuffer is a raw, untyped byte region — it has no element type, so "contains a
    // value" is ambiguous (a single byte? a multi-byte value at some offset? a byte sub-sequence?).
    // Rather than guess, point the user at a typed view, which both fixes the element type and
    // mirrors how their real code would read the buffer in the first place.
    throw new Error(
      "An ArrayBuffer has no element type to search for membership."
      + " \nWrap in a TypedArray view to check byte / element membership: expect(Uint8Array.wrap(buffer)).toContain(value) / .toContainEqual(value)"
    );
  }

  throw new Error("Cannot determine if type " + nameof<T>() + " contains a given value of type " + nameof<U>() + ".");
}

/**
 * Global bridge for the deep-equals compiler transform.
 *
 * Injected deep equality methods in user classes call this function for per-field
 * comparisons. Declared global to make it available in all user source files without import.
 * (solves the `afterParse` import resolution limitation where injected import statements
 * are not processed by the AS compiler)
 *
 * Returns __vitest_assemblyscript_EqualityResult so injected methods can propagate type mismatch information
 * from nested comparisons back to the top-level matcher.
 */
// @ts-ignore
@global
function __vitest_assemblyscript_compare_equals<T, U>(actual: T, expected: U): __vitest_assemblyscript_EqualityResult {
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
