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

/**
 * Cycle detection for stringification. Tracks which object pointers are currently
 * being stringified to prevent infinite recursion on self-referential objects.
 *
 * Uses add-on-entry/remove-on-exit discipline (unlike equalsRefPairs which is add-only).
 * This is necessary because stringifyValue is called twice per assertion (once for actual,
 * once for expected) — the same pointer appearing in both calls is not a cycle. Add/remove
 * ensures the set is naturally empty between calls with no external clearing needed.
 */
const stringifyVisited = new Set<usize>();

/**
 * Produces a human-readable string representation of a value for assertion messages.
 * Handles primitives, strings, arrays, Sets, Maps, ArrayBuffers, and user-defined objects.
 * Used by matchers to format actual/expected values in error output and diffs.
 */
export function stringifyValue<T>(item: T): string {
  if (isNull(item)) return "null";
  if (nan(item)) return "NaN";

  if (isReference<T>()) {
    if (isString<T>()) return `"${item}"`;

    // Cycle detection for all non-string reference types before recursive stringification
    const ptr = changetype<usize>(item);
    if (stringifyVisited.has(ptr)) return "[Circular]";
    stringifyVisited.add(ptr);

    let result: string;
    if (item instanceof ArrayBuffer) {
      result = `ArrayBuffer[${item.byteLength}]`;
    } else if (isArrayLike<T>(item)) {
      result = arrayMessageString(item);
    } else if (item instanceof Set) {
      result = setMessageString(item);
    } else if (item instanceof Map) {
      result = mapMessageString(item);
    // @ts-ignore: __vitest_assemblyscript_typename is injected by the compiler transform
    } else if (isDefined(item.__vitest_assemblyscript_typename)) {
      // Cast to NonNullable<T> because AS doesn't narrow nullability from the earlier
      // null check — it requires explicit type narrowing to call methods on nullable types.
      // Safe because null case returns "null" at the top of this function.
      const nonNullItem = <NonNullable<T>>item;
      // @ts-ignore
      const typeName: string = nonNullItem.__vitest_assemblyscript_typename();
      // @ts-ignore
      if (isDefined(nonNullItem.__vitest_assemblyscript_stringify)) {
        // @ts-ignore
        const fields: string = nonNullItem.__vitest_assemblyscript_stringify();
        result = fields != "" ? typeName + " { " + fields + " }" : typeName;
      } else {
        result = typeName;
      }
    } else {
      result = nameof<T>(item);
    }

    stringifyVisited.delete(ptr);
    return result;
  } else if (isBoolean<T>()){
    return bool(item).toString();
  } else if (isInteger<T>(item) || isFloat<T>(item)) {
    return item.toString();
  } else {
    return nameof<T>(item);
  }
}

/**
 * Global bridge for the compiler transform's injected stringify methods.
 *
 * Transform-injected __vitest_assemblyscript_stringify methods call this to format each
 * field value. Declared global to make it available in all source files without import,
 * solving the afterParse import resolution limitation.
 *
 * Loaded into the compilation transitively: user test imports
 * vitest-pool-assemblyscript/assembly → index.ts → expect.ts → compare.ts → utils.ts.
 */
// @ts-ignore: AS-specific global decorator
@global
function __vitest_assemblyscript_stringify_value<T>(item: T): string {
  return stringifyValue<T>(item);
}

function arrayMessageString<T extends ArrayLike<unknown>>(array: T): string {
  if (isNullable<T>(array) && array == null) {
    return "null";
  }

  let str = "[";
  for (let i = 0; i < array.length; i++) {
    str += stringifyValue(array[i]);

    if (i < array.length - 1) {
      str += ","
    }
  }
  str += "]";

  return str;
}

function setMessageString<T>(set: T): string {
  if (isNullable<T>(set) && set == null) {
    return "null";
  }

  if (set instanceof Set) {
    const values = set.values();
    let str = "Set {";
    for (let i = 0; i < values.length; i++) {
      if (i > 0) str += ",";
      str += " " + stringifyValue(values[i]);
    }
    if (values.length > 0) str += " ";
    str += "}";
    return str;
  }

  return nameof<T>(set);
}

function mapMessageString<T>(map: T): string {
  if (isNullable<T>(map) && map == null) {
    return "null";
  }

  if (map instanceof Map) {
    const keys = map.keys();
    let str = "Map {";
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) str += ",";
      str += " " + stringifyValue(keys[i]) + " => " + stringifyValue(map.get(keys[i]));
    }
    if (keys.length > 0) str += " ";
    str += "}";
    return str;
  }

  return nameof<T>(map);
}
