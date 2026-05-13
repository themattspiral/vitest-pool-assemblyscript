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
 * Encodes a string as a complete JSON string literal per RFC 7159, matching the
 * behavior of `JSON.stringify` (ES2019+). The result includes the surrounding
 * quotation marks, so it can be embedded directly into JSON or a JS source string.
 *
 * Escapes:
 * - quotation mark (U+0022) and reverse solidus (U+005C)
 * - control characters U+0000 through U+001F, using short forms (\b \t \n \f \r)
 *   where defined and \uXXXX otherwise
 * - U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR
 *   (so output is safe to embed inside a JavaScript string literal)
 * - lone/unpaired UTF-16 surrogates as \uXXXX (valid surrogate pairs are passed
 *   through unchanged so they continue to represent the same code point)
 */
export function escapeToJSONString(value: string): string {
  // Collect output as an array of chunks and join at the end, rather than
  // building with `+=` per character. `+=` on immutable strings copies the
  // accumulated result each iteration (O(n²) total); pushing chunks is O(1)
  // amortized and the final join performs a single bulk copy (O(n) total).
  const parts = new Array<string>();
  parts.push("\"");
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x22) {            // "
      parts.push("\\\"");
    } else if (code === 0x5C) {     // \
      parts.push("\\\\");
    } else if (code === 0x08) {     // backspace
      parts.push("\\b");
    } else if (code === 0x09) {     // tab
      parts.push("\\t");
    } else if (code === 0x0A) {     // line feed
      parts.push("\\n");
    } else if (code === 0x0C) {     // form feed
      parts.push("\\f");
    } else if (code === 0x0D) {     // carriage return
      parts.push("\\r");
    } else if (code < 0x20 || code === 0x2028 || code === 0x2029) {
      // other control chars
      parts.push("\\u");
      parts.push(toHex4(code));
    } else if (code >= 0xD800 && code <= 0xDBFF) {
      // High surrogate: pass through only if followed by a valid low surrogate.
      // Otherwise it's lone — escape it (matches ES2019+ JSON.stringify behavior).
      if (i + 1 < value.length) {
        const next = value.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          parts.push(value.charAt(i));
          parts.push(value.charAt(i + 1));
          i++;
        } else {
          parts.push("\\u");
          parts.push(toHex4(code));
        }
      } else {
        parts.push("\\u");
        parts.push(toHex4(code));
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // Lone low surrogate — any valid pair would have been consumed above.
      parts.push("\\u");
      parts.push(toHex4(code));
    } else {
      parts.push(value.charAt(i));
    }
  }
  parts.push("\"");
  return parts.join("");
}

/** Formats a code unit (0x0000–0xFFFF) as exactly 4 lowercase hex digits, zero-padded. */
function toHex4(code: i32): string {
  const hex = code.toString(16);
  if (hex.length >= 4) return hex;
  if (hex.length === 3) return "0" + hex;
  if (hex.length === 2) return "00" + hex;
  return "000" + hex;
}

/**
 * Reverses escapeToJSONString — decodes a complete JSON string literal per RFC 7159.
 *
 * The input must include the surrounding quotation marks (e.g. `"hello\nworld"`);
 * the returned string contains the decoded content with the quotes stripped.
 *
 * Recognizes:
 * - \" \\ \/ (the three character-literal escapes)
 * - \b \f \n \r \t (short-form control escapes)
 * - \uXXXX (4-digit hex Unicode escape — produces a single UTF-16 code unit;
 *   adjacent \uXXXX\uYYYY pairs that form a valid surrogate pair naturally
 *   reconstitute their original code point when joined into the result string)
 *
 * All other characters pass through unchanged.
 *
 * Throws on malformed input (missing/extra quotation marks, content after the
 * closing quote, trailing backslash, unknown escape character, incomplete \u
 * sequence, or non-hex digit in \u), matching the strictness of JSON.parse.
 */
export function unescapeJSONString(value: string): string {
  if (value.length < 2 || value.charCodeAt(0) !== 0x22) {
    throw new Error("Invalid JSON string: missing opening quotation mark");
  }

  // Fast-path scan over the inner content: look for the first backslash OR an
  // unescaped quote. If we find a quote and it's the very last character, the
  // input has no escape sequences and we can return the inner slice directly.
  let firstBackslash = -1;
  for (let i = 1; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x22) {
      if (i !== value.length - 1) {
        throw new Error("Invalid JSON string: content after closing quotation mark");
      }
      return value.substring(1, i);
    }
    if (c === 0x5C) {
      firstBackslash = i;
      break;
    }
  }
  if (firstBackslash === -1) {
    throw new Error("Invalid JSON string: missing closing quotation mark");
  }

  // Slow path: copy the verbatim inner prefix in one shot, then decode from
  // firstBackslash onward. Uses the same Array<string> + join("") strategy as
  // escapeToJSONString to avoid O(n²) string concatenation.
  const parts = new Array<string>();
  parts.push(value.substring(1, firstBackslash));

  let i = firstBackslash;
  while (i < value.length) {
    const code = value.charCodeAt(i);
    if (code === 0x22) {
      // Unescaped quote — must be the very last character (the closing quote).
      if (i !== value.length - 1) {
        throw new Error("Invalid JSON string: content after closing quotation mark");
      }
      return parts.join("");
    }
    if (code !== 0x5C) {
      parts.push(value.charAt(i));
      i++;
      continue;
    }
    if (i + 1 >= value.length) {
      throw new Error("Invalid JSON escape: trailing backslash");
    }
    const next = value.charCodeAt(i + 1);
    if (next === 0x22) {        // \"
      parts.push("\"");
      i += 2;
    } else if (next === 0x5C) { // \\
      parts.push("\\");
      i += 2;
    } else if (next === 0x2F) { // \/
      parts.push("/");
      i += 2;
    } else if (next === 0x62) { // \b
      parts.push("\b");
      i += 2;
    } else if (next === 0x66) { // \f
      parts.push("\f");
      i += 2;
    } else if (next === 0x6E) { // \n
      parts.push("\n");
      i += 2;
    } else if (next === 0x72) { // \r
      parts.push("\r");
      i += 2;
    } else if (next === 0x74) { // \t
      parts.push("\t");
      i += 2;
    } else if (next === 0x75) { // \uXXXX
      if (i + 6 > value.length) {
        throw new Error("Invalid JSON escape: incomplete \\u sequence");
      }
      const codeUnit = parseHex4(value, i + 2);
      parts.push(String.fromCharCode(codeUnit));
      i += 6;
    } else {
      throw new Error("Invalid JSON escape: unknown escape character");
    }
  }

  // Reached end of input without seeing an unescaped closing quote.
  throw new Error("Invalid JSON string: missing closing quotation mark");
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

/** Parses exactly 4 hex digits from `value` starting at `offset`. Throws on a non-hex digit. */
function parseHex4(value: string, offset: i32): i32 {
  let result = 0;
  for (let j = 0; j < 4; j++) {
    const c = value.charCodeAt(offset + j);
    let digit: i32;
    if (c >= 0x30 && c <= 0x39) {        // 0-9
      digit = c - 0x30;
    } else if (c >= 0x41 && c <= 0x46) { // A-F
      digit = c - 0x41 + 10;
    } else if (c >= 0x61 && c <= 0x66) { // a-f
      digit = c - 0x61 + 10;
    } else {
      throw new Error("Invalid JSON escape: \\u sequence contains non-hex character");
    }
    result = (result << 4) | digit;
  }
  return result;
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
 * Produces a human-readable string representation of a value for assertion messages.
 * Handles primitives, strings, arrays, Sets, Maps, ArrayBuffers, and user-defined objects.
 * Used by matchers to format actual/expected values in error output and diffs.
 */
export function stringifyValue<T>(item: T, formatForDiff: bool = true, depth: i32 = 0): string {
  if (isNull(item)) return "null";
  if (nan(item)) return "NaN";

  if (isReference<T>()) {
    if (isString<T>()) return formatForDiff ? escapeToDiffString(<string>item) : `"${item}"`;

    // Cycle detection for all non-string reference types before recursive stringification
    const ptr = changetype<usize>(item);
    if (stringifyVisited.has(ptr)) return "[Circular]";
    stringifyVisited.add(ptr);

    let result: string;
    if (item instanceof ArrayBuffer) {
      result = `ArrayBuffer[${item.byteLength}]`;
    } else if (isArrayLike<T>(item)) {
      result = arrayMessageString(item, formatForDiff, depth);
    } else if (item instanceof Set) {
      result = setMessageString(item, formatForDiff, depth);
    } else if (item instanceof Map) {
      result = mapMessageString(item, formatForDiff, depth);
    // @ts-ignore: __vitest_assemblyscript_typename is injected by the compiler transform
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
        // @ts-ignore
        const fields: string = nonNullItem.__vitest_assemblyscript_stringify(formatForDiff, depth);
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
 *
 * Loaded into the compilation transitively: user test imports
 * vitest-pool-assemblyscript/assembly → index.ts → expect.ts → compare.ts → utils.ts.
 */
// @ts-ignore: AS-specific global decorator
@global
function __vitest_assemblyscript_stringify_value<T>(item: T, formatForDiff: bool = true, depth: i32 = 0): string {
  return stringifyValue<T>(item, formatForDiff, depth);
}

// @ts-ignore: AS-specific global decorator
@global
function __vitest_assemblyscript_escape_to_json_string(str: string): string {
  return escapeToJSONString(str);
}

// @ts-ignore: AS-specific global decorator
@global
function __vitest_assemblyscript_escape_to_diff_string(str: string): string {
  return escapeToDiffString(str);
}

// @ts-ignore: AS-specific global decorator
@global
function __vitest_assemblyscript_stringify_indent(depth: i32): string {
  return stringifyIndent(depth);
}

function arrayMessageString<T extends ArrayLike<unknown>>(array: T, formatForDiff: bool, depth: i32): string {
  if (isNullable<T>(array) && array == null) return "null";
  if (array.length === 0) return "[]";

  const open = formatForDiff ? "[\n" : "[";
  const childIndent = formatForDiff ? stringifyIndent(depth + 1) : "";
  const sep = formatForDiff ? ",\n" : ", ";
  const close = formatForDiff ? "\n" + stringifyIndent(depth) + "]" : "]";

  let str = open;
  for (let i = 0; i < array.length; i++) {
    if (i > 0) str += sep;
    str += childIndent + stringifyValue(array[i], formatForDiff, depth + 1);
  }
  str += close;
  return str;
}

function setMessageString<T>(set: T, formatForDiff: bool, depth: i32): string {
  if (isNullable<T>(set) && set == null) return "null";
  if (!(set instanceof Set)) return nameof<T>(set);

  const values = set.values();
  if (values.length === 0) return "Set {}";

  const open = formatForDiff ? "Set {\n" : "Set { ";
  const childIndent = formatForDiff ? stringifyIndent(depth + 1) : "";
  const sep = formatForDiff ? ",\n" : ", ";
  const close = formatForDiff ? "\n" + stringifyIndent(depth) + "}" : " }";

  let str = open;
  for (let i = 0; i < values.length; i++) {
    if (i > 0) str += sep;
    str += childIndent + stringifyValue(values[i], formatForDiff, depth + 1);
  }
  str += close;
  return str;
}

function mapMessageString<T>(map: T, formatForDiff: bool, depth: i32): string {
  if (isNullable<T>(map) && map == null) return "null";
  if (!(map instanceof Map)) return nameof<T>(map);

  const keys = map.keys();
  if (keys.length === 0) return "Map {}";

  const open = formatForDiff ? "Map {\n" : "Map { ";
  const childIndent = formatForDiff ? stringifyIndent(depth + 1) : "";
  const sep = formatForDiff ? ",\n" : ", ";
  const close = formatForDiff ? "\n" + stringifyIndent(depth) + "}" : " }";

  let str = open;
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) str += sep;
    str += childIndent + stringifyValue(keys[i], formatForDiff, depth + 1) + " => " + stringifyValue(map.get(keys[i]), formatForDiff, depth + 1);
  }
  str += close;
  return str;
}
