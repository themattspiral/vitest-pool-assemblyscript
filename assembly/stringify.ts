import { isNull, nan } from './compare';

/**
 * Produces a human-readable string representation of a value for assertion messages.
 * Handles primitives, strings, arrays, Sets, Maps, ArrayBuffers, and user-defined objects.
 * Used by matchers to format actual/expected values in error output and diffs.
 */
export function itemMessageString<T>(item: T): string {
  if (isNull(item)) return "null";
  if (nan(item)) return "NaN";

  if (isReference<T>()) {
    if (isString<T>()) return `"${item}"`;
    else if (item instanceof ArrayBuffer) return `ArrayBuffer[${item.byteLength}]`;
    else if (isArrayLike<T>(item)) return arrayMessageString(item);
    else if (item instanceof Set) return setMessageString(item);
    else if (item instanceof Map) return mapMessageString(item);
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

function setMessageString<T>(set: T): string {
  if (isNullable<T>(set) && set == null) {
    return "null";
  }

  if (set instanceof Set) {
    const values = set.values();
    let str = "Set {";
    for (let i = 0; i < values.length; i++) {
      if (i > 0) str += ",";
      str += " " + itemMessageString(values[i]);
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
      str += " " + itemMessageString(keys[i]) + " => " + itemMessageString(map.get(keys[i]));
    }
    if (keys.length > 0) str += " ";
    str += "}";
    return str;
  }

  return nameof<T>(map);
}
