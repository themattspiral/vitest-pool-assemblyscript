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
 * Encodes a string as a diff-friendly string literal, matching pretty-format's
 * `escapeString: true` (vitest's diff display default) behavior.
 *
 * Escapes ONLY the two characters that would otherwise be ambiguous inside a quoted literal:
 * - quotation mark (U+0022) → \"
 * - reverse solidus (U+005C) → \\
 *
 * All other characters — including raw control characters (newlines, tabs, etc.), surrogates,
 * U+2028, and U+2029 — pass through literally. This is intentional: vitest's diff renders
 * these as raw whitespace so the diff display can break naturally on newlines within strings
 * and each visible line gets its own +/− marker.
 *
 * Wraps the result in surrounding quotation marks, producing a complete diff-form string literal.
 */
export function escapeToDiffString(value: string): string {
  // Fast path: if the string contains neither " nor \, no escaping is needed and we can
  // skip the per-character allocation work below.
  let firstEscape = -1;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x22 || c === 0x5C) {
      firstEscape = i;
      break;
    }
  }
  if (firstEscape === -1) return `"${value}"`;

  // Slow path: copy the verbatim prefix in one shot, then escape from firstEscape onward.
  // Uses the same Array<string> + join("") strategy as escapeToJSONString to avoid O(n²)
  // string concatenation.
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

function stringifyIndent(depth: i32): string {
  if (depth <= 0) return "";
  let s = "";
  for (let i = 0; i < depth; i++) s += "  ";
  return s;
}

/**
 * Character budget for short-form (single-line) stringification
 */
export const STRINGIFY_SHORT_FORM_BUDGET: i32 = 40;

/**
 * Returns true when adding the next piece (plus its trailing separator and the room
 * needed for a `…(N)` truncation marker) would push the accumulated content past
 * `budget`. A negative budget is the "unlimited" sentinel (diff mode)
 */
// @ts-ignore: top level decorators are supported in AssemblyScript
@inline
function exceedsBudget(used: i32, pieceLen: i32, sepLen: i32, truncMarkerLen: i32, budget: i32): bool {
  return budget >= 0 && used + pieceLen + sepLen + truncMarkerLen > budget;
}

/**
 * Renders a string value as a short-form literal subject to `budget`:
 * - `budget < 0` (unlimited) or the full `"<s>"` fits → returned unchanged
 * - Otherwise produces `"<sliced>…"`, where the closing quote and ellipsis count
 *   as 3 chars of fixed scaffolding which is always emitted — even when
 *   `budget < 3`, so output may exceed `budget` in that corner case. This
 *   guarantees the user always sees an identifiable string token rather than
 *   collapsing to nothing.
 *
 * Surrogate-aware: if the cut would leave a lone high surrogate (the matching
 * low surrogate falls in the dropped portion), back off by one code unit so the
 * truncated string remains well-formed UTF-16.
 */
function truncateStringContent(s: string, budget: i32): string {
  if (budget < 0 || 2 + s.length <= budget) {
    return `"${s}"`;
  }
  let sliceLen = budget - 3;
  if (sliceLen < 0) sliceLen = 0;
  if (sliceLen > 0) {
    const code = s.charCodeAt(sliceLen - 1);
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
      // Closing brace sits at the depth of this value (one less than its inner content's depth).
      // In short-form mode no indent applies — everything stays on a single line.
      const closeIndent = formatForDiff ? stringifyIndent(depth) : "";

      // @ts-ignore
      const typeName: string = nonNullItem.__vitest_assemblyscript_typename();
      // @ts-ignore
      if (isDefined(nonNullItem.__vitest_assemblyscript_stringify)) {
        // Short-form scaffolding is `${typeName}{ ` + ` }` = typeName.length + 4 chars.
        // The injected method emits only the content (no scaffolding), so we hand it
        // contentBudget = max(0, budget - scaffolding). The max(0, ...) clamp keeps
        // tight-but-positive arithmetic from underflowing into the `< 0` "unlimited"
        // sentinel meaning. Diff form passes budget = -1 → contentBudget = -1.
        const contentBudget = budget < 0 ? -1 : max(0, budget - typeName.length - 4);
        // @ts-ignore
        const fields: string = nonNullItem.__vitest_assemblyscript_stringify(formatForDiff, depth, contentBudget);
        result = fields === "" ? typeName : `${typeName}${spaceAfterType}{${nl}${fields}${nl}${closeIndent}}`;
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
 * field value. Declared global to make it available in all user source files without importing.
 */
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
function __vitest_assemblyscript_exceeds_budget(used: i32, pieceLen: i32, sepLen: i32, truncMarkerLen: i32, budget: i32): bool {
  return exceedsBudget(used, pieceLen, sepLen, truncMarkerLen, budget);
}

function arrayMessageString<T extends ArrayLike<unknown>>(array: T, formatForDiff: bool, depth: i32, budget: i32): string {
  if (isNullable<T>(array) && array == null) return "null";
  if (array.length === 0) return "[]";

  const open = formatForDiff ? "[\n" : "[";
  const childIndent = formatForDiff ? stringifyIndent(depth + 1) : "";
  const sep = formatForDiff ? ",\n" : ", ";
  const close = formatForDiff ? `\n${stringifyIndent(depth)}]` : "]";

  // Clamp contentBudget to non-negative when budget >= 0 so the truncMarker still
  // fires even if scaffolding has already consumed the entire budget; the clamp also
  // keeps tight arithmetic from accidentally crossing into the `< 0` "unlimited"
  // sentinel meaning. Diff form passes budget = -1 → contentBudget = -1.
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
    // Map entry: key gets parent's full remaining budget; value gets remaining minus
    // the rendered key length and the " => " separator (4 chars). Mirrors loupe — keys
    // are typically short, so most of the budget naturally falls through to the value.
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
