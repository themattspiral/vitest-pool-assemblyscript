export function isNull<T>(value: T): bool {
  if (isReference<T>()) {
    if (isNullable<T>()) {
      // Use changetype pointer checks instead of `== null` / `!= null` to avoid
      // invoking user-defined @operator("==") overloads, which reject null arguments
      return changetype<usize>(value) == 0;
    } else {
      return false;
    }
  } else {
    if (isBoolean<T>()) {
      return false;
    } else if (isVector<T>()) {
      return false;
    } else {
      // handles bare nulls
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
 * Encodes a string as a quoted diff-form literal, matching pretty-format's
 * `escapeString: true` behavior (vitest's diff display default)
 */
export function escapeToDiffString(value: string): string {
  // Only `"` and `\` are escaped - All other characters (control chars, surrogates, etc)
  // pass through raw so vitest's diff can break on newlines naturally
  let firstEscape = -1;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x22 || c === 0x5C) {
      firstEscape = i;
      break;
    }
  }
  // Fast path: no escapes needed
  if (firstEscape === -1) return `"${value}"`;

  // Array<string> + join("") avoids O(n^2) concatenation on the slow path
  const parts = new Array<string>();
  parts.push("\"");
  parts.push(value.substring(0, firstEscape));
  for (let i = firstEscape; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x22) {
      parts.push("\\\"");
    } else if (code === 0x5C) {
      parts.push("\\\\");
    } else {
      parts.push(value.charAt(i));
    }
  }
  parts.push("\"");
  return parts.join("");
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

// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
function stringifyIndent(depth: i32): string {
  if (depth <= 0) return "";
  let s = "";
  for (let i = 0; i < depth; i++) s += "  ";
  return s;
}

/** Character budget for short-form (single-line) stringification */
export const STRINGIFY_SHORT_FORM_BUDGET: i32 = 40;

/**
 * Returns true when the next piece + separator + truncation marker would push
 * accumulated content past `budget` (`budget < 0` is the unlimited sentinel for diff mode)
 */
// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
function exceedsBudget(used: i32, pieceLen: i32, sepLen: i32, truncMarkerLen: i32, budget: i32): bool {
  return budget >= 0 && used + pieceLen + sepLen + truncMarkerLen > budget;
}

/**
 * Renders a string as a short-form literal `"<s>"` constrained by `budget`,
 * producing `"<sliced>…"` when the full literal would overflow
 * (`budget < 0` is the unlimited sentinel for diff mode)
 */
function truncateStringContent(s: string, budget: i32): string {
  if (budget < 0 || 2 + s.length <= budget) {
    return `"${s}"`;
  }
  // Output scaffolding is opening quote + ellipsis + closing quote = 3 chars, always
  // emitted even when budget < 3 so the user still sees an identifiable string token
  let sliceLen = budget - 3;
  if (sliceLen < 0) sliceLen = 0;
  if (sliceLen > 0) {
    const code = s.charCodeAt(sliceLen - 1);
    // Don't leave a lone high surrogate from a surrogate pair
    if (code >= 0xD800 && code <= 0xDBFF) {
      sliceLen -= 1;
    }
  }
  return `"${s.substring(0, sliceLen)}…"`;
}

/**
 * Produces a human-readable string representation of a value for assertion messages.
 * Handles primitives, strings, arrays, Sets, Maps, ArrayBuffers, and user-defined objects.
 * Used by matchers to format actual/expected values in error output and diffs.
 */
export function stringifyValue<T>(item: T, formatForDiff: bool = true, depth: i32 = 0, budget: i32 = -1): string {
  if (isNull(item)) return "null";
  if (nan(item)) return "NaN";

  if (isReference<T>()) {
    if (isString<T>()) {
      return formatForDiff ? escapeToDiffString(<string>item) : truncateStringContent(<string>item, budget);
    }

    // Cycle detection for all non-string reference types before recursive stringification
    const ptr = changetype<usize>(item);
    if (stringifyVisited.has(ptr)) return "[Circular]";
    stringifyVisited.add(ptr);

    let result: string;
    if (item instanceof ArrayBuffer) {
      result = `ArrayBuffer[${item.byteLength}]`;
    } else if (isArrayLike<T>(item)) {
      result = arrayMessageString(item, formatForDiff, depth, budget);
    } else if (item instanceof Set) {
      result = setMessageString(item, formatForDiff, depth, budget);
    } else if (item instanceof Map) {
      result = mapMessageString(item, formatForDiff, depth, budget);
    // @ts-ignore
    } else if (isDefined(item.__vitest_assemblyscript_typename)) {
      // Cast to NonNullable<T> because AS doesn't narrow nullability from the earlier
      // null check — it requires explicit type narrowing to call methods on nullable types.
      // Safe because null case returns "null" at the top of this function.
      const nonNullItem = <NonNullable<T>>item;
      const spaceAfterType = formatForDiff ? " " : "";
      const nl = formatForDiff ? "\n" : " ";
      // Close brace sits at this value's depth (one less than its inner content)
      const closeIndent = formatForDiff ? stringifyIndent(depth) : "";

      // @ts-ignore
      const typeName: string = nonNullItem.__vitest_assemblyscript_typename();
      // @ts-ignore
      if (isDefined(nonNullItem.__vitest_assemblyscript_stringify)) {
        // Reserve scaffolding (`${typeName}{ ` + ` }` = typeName.length + 4) from the budget
        // before passing the remainder to the injected method, which emits only the content.
        // max(0, ...) keeps tight arithmetic from crossing into the `< 0` unlimited sentinel.
        const contentBudget = budget < 0 ? -1 : max(0, budget - typeName.length - 4);
        // @ts-ignore
        const fields: string = nonNullItem.__vitest_assemblyscript_stringify(formatForDiff, depth, contentBudget);
        result = fields === "" ? typeName : `${typeName}${spaceAfterType}{${nl}${fields}${nl}${closeIndent}}`;
      } else {
        result = typeName;
      }
    // @ts-ignore
    } else if (isDefined(item.__vitest_assemblyscript_custom_stringify)) {
      // @ts-ignore
      result = item.__vitest_assemblyscript_custom_stringify(formatForDiff, depth, budget);
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

// Global bridge functions for the deep-equals transform's injected stringify methods.
// Declared global to make them available in all user source files without importing.
// (solves the `afterParse` import resolution limitation where injected import statements
// are not processed by the AS compiler)

// @ts-ignore: top level decorators are supported in AssemblyScript
@global
function __vitest_assemblyscript_stringify_value<T>(item: T, formatForDiff: bool = true, depth: i32 = 0, budget: i32 = -1): string {
  return stringifyValue<T>(item, formatForDiff, depth, budget);
}

// @ts-ignore: top level decorators are supported in AssemblyScript
@global
function __vitest_assemblyscript_escape_to_diff_string(str: string): string {
  return escapeToDiffString(str);
}

// @ts-ignore: top level decorators are supported in AssemblyScript
@global @inline
function __vitest_assemblyscript_stringify_indent(depth: i32): string {
  return stringifyIndent(depth);
}

// @ts-ignore: top level decorators are supported in AssemblyScript
@global @inline
function __vitest_assemblyscript_stringify_exceeds_budget(used: i32, pieceLen: i32, sepLen: i32, truncMarkerLen: i32, budget: i32): bool {
  return exceedsBudget(used, pieceLen, sepLen, truncMarkerLen, budget);
}

function arrayMessageString<T extends ArrayLike<unknown>>(array: T, formatForDiff: bool, depth: i32, budget: i32): string {
  if (isNullable<T>(array) && array == null) return "null";
  if (array.length === 0) return "[]";

  const open = formatForDiff ? "[\n" : "[";
  const childIndent = formatForDiff ? stringifyIndent(depth + 1) : "";
  const sep = formatForDiff ? ",\n" : ", ";
  const close = formatForDiff ? `\n${stringifyIndent(depth)}]` : "]";

  // Reserve open/close scaffolding from the budget. max(0, ...) keeps the truncMarker firing
  // even when scaffolding consumed it all, and prevents crossing into the `< 0` sentinel.
  const contentBudget = budget < 0 ? -1 : max(0, budget - open.length - close.length);

  const n = array.length;
  let str = open;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const sepLen = isLast ? 0 : sep.length;
    const truncMarker = contentBudget < 0 ? "" : `…(${n - i})`;
    const childBudget = contentBudget < 0 ? -1 : max(0, contentBudget - used - sepLen - truncMarker.length);
    const piece = `${childIndent}${stringifyValue(array[i], formatForDiff, depth + 1, childBudget)}`;
    if (exceedsBudget(used, piece.length, sepLen, truncMarker.length, contentBudget)) {
      str += truncMarker;
      break;
    }
    str += piece;
    used += piece.length;
    if (!isLast) { str += sep; used += sep.length; }
  }
  str += close;
  return str;
}

function setMessageString<T>(set: T, formatForDiff: bool, depth: i32, budget: i32): string {
  if (isNullable<T>(set) && set == null) return "null";
  if (!(set instanceof Set)) return nameof<T>(set);

  const values = set.values();
  if (values.length === 0) return "Set {}";

  const open = formatForDiff ? "Set {\n" : "Set { ";
  const childIndent = formatForDiff ? stringifyIndent(depth + 1) : "";
  const sep = formatForDiff ? ",\n" : ", ";
  const close = formatForDiff ? `\n${stringifyIndent(depth)}}` : " }";

  const contentBudget = budget < 0 ? -1 : max(0, budget - open.length - close.length);

  const n = values.length;
  let str = open;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const sepLen = isLast ? 0 : sep.length;
    const truncMarker = contentBudget < 0 ? "" : `…(${n - i})`;
    const childBudget = contentBudget < 0 ? -1 : max(0, contentBudget - used - sepLen - truncMarker.length);
    const piece = `${childIndent}${stringifyValue(values[i], formatForDiff, depth + 1, childBudget)}`;
    if (exceedsBudget(used, piece.length, sepLen, truncMarker.length, contentBudget)) {
      str += truncMarker;
      break;
    }
    str += piece;
    used += piece.length;
    if (!isLast) { str += sep; used += sep.length; }
  }
  str += close;
  return str;
}

function mapMessageString<T>(map: T, formatForDiff: bool, depth: i32, budget: i32): string {
  if (isNullable<T>(map) && map == null) return "null";
  if (!(map instanceof Map)) return nameof<T>(map);

  const keys = map.keys();
  if (keys.length === 0) return "Map {}";

  const open = formatForDiff ? "Map {\n" : "Map { ";
  const childIndent = formatForDiff ? stringifyIndent(depth + 1) : "";
  const sep = formatForDiff ? ",\n" : ", ";
  const close = formatForDiff ? `\n${stringifyIndent(depth)}}` : " }";

  const contentBudget = budget < 0 ? -1 : max(0, budget - open.length - close.length);

  const n = keys.length;
  let str = open;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const sepLen = isLast ? 0 : sep.length;
    const truncMarker = contentBudget < 0 ? "" : `…(${n - i})`;
    const childBudget = contentBudget < 0 ? -1 : max(0, contentBudget - used - sepLen - truncMarker.length);
    // key gets the full remaining budget; value gets what's left after key + " => " (4 chars)
    // (mirrors loupe lib used by chai/vitest)
    const keyStr = stringifyValue(keys[i], formatForDiff, depth + 1, childBudget);
    const valBudget = childBudget < 0 ? -1 : max(0, childBudget - keyStr.length - 4);
    const valStr = stringifyValue(map.get(keys[i]), formatForDiff, depth + 1, valBudget);
    const piece = `${childIndent}${keyStr} => ${valStr}`;
    if (exceedsBudget(used, piece.length, sepLen, truncMarker.length, contentBudget)) {
      str += truncMarker;
      break;
    }
    str += piece;
    used += piece.length;
    if (!isLast) { str += sep; used += sep.length; }
  }
  str += close;
  return str;
}
