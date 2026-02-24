
# Matchers API

This project aims to follow the [vitest/jest `expect()` API](https://vitest.dev/api/expect.html) as closely as possible, with some necessary differences given AssemblyScript's static-typing.

- [`.not`](#not)
- [`toBe()`](#tobe)
- [`toBeCloseTo()`](#tobecloseto)
- [`toEqual()`](#toequal)
- [`toStrictEqual()`](#tostrictequal)
- [`toBeTruthy()` & `toBeFalsy()`](#tobetruthy--tobefalsy)
- [`toBeNull()`](#tobenull)
- [`toBeNullable()`](#tobenullable)
- [`toBeNaN()`](#tobenan)
- [`toHaveLength()`](#tohavelength)
- [`toThrowError()`](#tothrowerror)
- [`toBeGreaterThan()`](#tobegreaterthan)
- [`toBeGreaterThanOrEqual()`](#tobegreaterthanorequal)
- [`toBeLessThan()`](#tobelessthan)
- [`toBeLessThanOrEqual()`](#tobelessthanorequal)
- [Planned Matchers](#planned-matchers)
- [Likely Matchers](#likely-matchers)

The following subset of vitest/jest expect matchers are currently supported:

### `.not`
Inverts the matcher that follows. Can be chained.
```typescript
expect(1).not.toBe(2);
expect("hello").not.toBeNull();
```

### `toBe()`
Checks that a value is what you expect using identity comparison. Primitives and strings are compared by value, and references are checked for reference equality only (including objects and arrays).

Cross-type numeric comparisons are allowed where AssemblyScript's own `==` operator permits them. Combinations where the float type lacks sufficient mantissa precision for the integer type's range will throw an error, matching the AS compiler's behavior.

| | i8, i16 | i32 | i64 | u8, u16 | u32 | u64 |
|---|---|---|---|---|---|---|
| **f32** | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| **f64** | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |

`toBeCloseTo()` is safer for any comparison involving a float and allows all numeric types because it can still produce accurate results in precision loss casting edge cases.
```typescript
expect(1 + 1).toBe(2);
expect("hello").toBe("hello");

// cross-type integer comparisons
expect(i64(42)).toBe(u8(42));

// supported float/integer comparisons (small integer types)
expect(f64(42.0)).toBe(i32(42));

// unsupported float/integer comparisons throw an error
// expect(f32(42.0)).toBe(i32(42));  // Error: float precision insufficient
// expect(f64(42.0)).toBe(i64(42));  // Error: float precision insufficient
```

#### SIMD Vector Support (`v128`)

SIMD vectors use WASM's native `==` comparison like other primitives. For `v128` vectors, this compares at the bit level, so that two vectors are identical when all 128 bits match, regardless of which lane type was used to construct them (e.g. `i32x4`, `f32x4`, `f64x2`).

```typescript
expect(i32x4.splat(42)).toBe(i32x4.splat(42));
expect(f64x2(3.14, 2.72)).toBe(f64x2(3.14, 2.72));

// different lane types with the same underlying bits are identical
expect(i64x2(3, 7)).toBe(i32x4(3, 0, 7, 0));

// different lane types with different bit representations are not identical
expect(i32x4.splat(1)).not.toBe(f32x4(1.0, 1.0, 1.0, 1.0));
```

>ℹ️ SIMD requires `--enable simd` in the AssemblyScript compiler flags. Add `extraCompilerFlags: ['--enable', 'simd']` to your pool options.

### `toBeCloseTo()`
Checks if a floating point value is close to what you expect. Using exact equality with floating point numbers often doesn't work correctly, because of internal rounding to represent floats in binary. This rounding means intuitive comparisons will often fail, so this matcher checks if they are "close enough" to be considered equal.

Accepts an additional `precision: i32` argument to tailor to your use case: Number of decimal places that must match for values to be considered close. Defaults to 2 digits, meaning effectively that values must be within 0.005 of each other.

Strings are compared by value equality, with any `precision` ignored. Non-numeric, non-string types return false.
```typescript
expect(0.1 + 0.2).toBeCloseTo(0.3);
expect(1.005).toBeCloseTo(1.0, 1);
```

>ℹ️ SIMD vectors (`v128`) are not supported by `toBeCloseTo()`. Approximate comparison requires a lane type interpretation to extract numeric values. Extract lane values and compare them individually instead:
>```typescript
>const v: v128 = f32x4(0.1, 0.2, 0.3, 0.4);
>expect(f32x4.extract_lane(v, 2)).toBeCloseTo(0.3);
>```

### `toEqual()`
Checks that two values have the same value (deep equality). Primitives and strings are compared by value.

Like `toBe`, cross-type numeric comparisons follow AssemblyScript's own `==` operator restrictions. Combinations where the float type lacks sufficient mantissa precision for the integer type's range will throw an error (e.g. `f32` vs `i32`, `f64` vs `i64`).

```typescript
expect([1, 2, 3]).toEqual([1, 2, 3]);
expect(["one", "two", "three"]).toEqual(["one", "two", "three"]);
```

#### Built-In Reference Types
Built-in object references are compared with the following deep equality rules:
- **`Set`**: membership equality (same elements, order-independent)
- **`Map`**: key-by-key comparison using `toEqual()` on values
- **`Array`**: element-by-element comparison using `toEqual()` recursively
- **`ArrayBuffer`**: byte-level content comparison

```typescript
// byte-level comparison
const a = new ArrayBuffer(4);
const b = new ArrayBuffer(4);
store<u8>(changetype<usize>(a), 0x42);
store<u8>(changetype<usize>(b), 66);  // 66 decimal == 0x42 hex
expect(a).toEqual(b);
```

#### User-Defined Reference Types
User object references of the same runtime type use a deep field-by-field comparison of all stored instance fields using `toEqual()` recursively:
- Includes public, protected, and private fields
- Getters are **excluded**
- User-defined `@operator("==")` or `.equals()` methods are used if present, instead of field-by-field comparison
- Supports inheritance, generics, and nullable fields

>⚠️ AS vs JS Quirk: Objects with different runtime types are **not equal** using `toEqual()` even when they share the same fields & values, which makes `toEqual` and `toStrictEqual()` work identically in the AssemblyScript pool. This differs from vitest's JavaScript `toEqual()`, which compares structurally regardless of constructor / runtime type.

>ℹ️ If a user class extends a library class (from `node_modules` or AS stdlib), only the user class's own declared fields are compared. Inherited library fields are not included, as deep equality injection is scoped to user source files only.

```typescript
// deep equality
const p1 = new Point(1, 2);
const p2 = new Point(1, 2);
expect(p1).toEqual(p2);

// here, Color compares RGB only, ignores name
// export class Color {
//   @operator("==")
//   equalsAnotherColor(other: Color): bool {
//     return this.r == other.r && this.g == other.g && this.b == other.b;
//   }
// }

// respects custom equality semantics defined in @operator("==") or .equals()
const c1 = new Color(255, 0, 0, "red");
const c2 = new new Color(255, 0, 0, "scarlet");
expect(c1).toEqual(c2);
```

#### SIMD Vector Support (`v128`)

SIMD vectors use WASM's native `==` comparison like other primitives. For `v128` vectors, this compares at the bit level, so that two vectors are identical when all 128 bits match, regardless of which lane type was used to construct them (e.g. `i32x4`, `f32x4`, `f64x2`).

```typescript
expect(i32x4.splat(42)).toEqual(i32x4.splat(42));
expect(f64x2(3.14, 2.72)).toEqual(f64x2(3.14, 2.72));

// different lane types with the same underlying bits are equal
expect(i64x2(3, 7)).toEqual(i32x4(3, 0, 7, 0));

// different lane types with different bit representations are not equal
expect(i32x4.splat(1)).not.toEqual(f32x4(1.0, 1.0, 1.0, 1.0));
```

### `toStrictEqual()`
Alias for `toEqual()`.

In vitest's JavaScript pools, `toEqual()` compares structurally regardless of constructor / runtime type, while `toStrictEqual()` requires matching runtime types also.

In the AssemblyScript pool, `toEqual()` also requires matching runtime types. This is consistent with how most testing frameworks behave for statically-typed languages without runtime reflection, but it means that `toEqual()` and `toStrictEqual()` work identically in the AssemblyScript pool.

### `toBeTruthy()` & `toBeFalsy()`
Check that a value is truthy or falsy.

Falsy values in AssemblyScript are `0`, `false`, `NaN`, and `null`.

```typescript
expect(1).toBeTruthy();
expect("hello").toBeTruthy();
expect("").toBeTruthy();  // <-- Empty String is TRUTHY in AS!

expect(0).toBeFalsy();
expect(NaN).toBeFalsy();
expect(null).toBeFalsy();
expect("").not.toBeFalsy();  // not falsy in AS (unlike JS)
```

>⚠️ AS vs JS Quirk: Unlike in JavaScript, empty string (`""`) is truthy in AssemblyScript because it is an object reference, not a primitive. An empty string is still an allocated object with a non-zero address, so it evaluates as truthy!

>ℹ️ `toBeFalsey()` is still available as a deprecated alias for `toBeFalsy()`.

#### SIMD Vector Support (`v128`)

An all-zero `v128` is falsy; a vector with at least one non-zero bit is truthy.

```typescript
expect(i32x4.splat(1)).toBeTruthy();
expect(i32x4.splat(0)).toBeFalsy();
```

### `toBeNull()`
Checks that a value is null (`usize(0)` in AssemblyScript).

```typescript
const val: string | null = null;
expect(val).toBeNull();
expect("hello").not.toBeNull();
expect(0).not.toBeNull();
expect(false).not.toBeNull();
```

### `toBeNullable()`
Checks that the type of the value is nullable (can hold `null`). This is a type-level check, not a value check — use `toBeNull()` to check if a value *is* null.

```typescript
const val: string | null = null;
expect(val).toBeNullable();
expect("hello").not.toBeNullable();
```

### `toBeNaN()`
Checks that a floating point value is `NaN`.

```typescript
expect(NaN).toBeNaN();
expect(1.0).not.toBeNaN();
```

### `toHaveLength()`
Checks that an array or array-like value has the expected length.

```typescript
expect([1, 2, 3]).toHaveLength(3);
expect([]).toHaveLength(0);
expect("hello world").toHaveLength(11);
```

### `toThrowError()`
Checks that a function throws an error when called. Optionally checks that the error message matches the provided string. Also available as `toThrow()`.

```typescript
expect(() => { throw new Error("boom"); }).toThrowError();
expect(() => { throw new Error("boom"); }).toThrowError("boom");
```

>⚠️ AS Quirk: You must provide a callback with a non-inferred type to expect() when using `toThrowError()`, e.g. `expect(() => { returnsNumber(); })` (definitely void) or `expect((): i32 => returnsNumber())` (explicit type)

>ℹ️ Note: `toThrowError()` does not accept inversion using `expect().not.toThrowError()`

### `toBeGreaterThan()`
Checks that a value is greater than the expected value. Supports numeric types (integers, floats, booleans) and strings (lexicographic comparison).

Cross-type numeric comparisons are allowed where safe, including cross-sign integers (more permissive than AS's own `>` operator). Booleans are treated as numeric (true=1, false=0).

| | i8, i16 | i32 | i64 | u8, u16 | u32 | u64 |
|---|---|---|---|---|---|---|
| **f32** | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| **f64** | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |

```typescript
expect(10).toBeGreaterThan(5);
expect(3.14).toBeGreaterThan(3);
expect("banana").toBeGreaterThan("apple");

// cross-sign integers are supported (AS rejects these at the language level)
expect(i32(42)).toBeGreaterThan(u32(10));

// booleans behave as numeric
expect(true).toBeGreaterThan(false);
```

>⚠️ Nullable strings where either value is null will throw an error. Use `toBeNull()` to check for null values.

>⚠️ Non-string reference types (objects, arrays, etc) are not comparable and will throw an error.

>ℹ️ SIMD vectors (`v128`) are not supported by inequality matchers. SIMD lane-wise comparison intrinsics require a specific lane type interpretation (e.g. `i32x4`, `f32x4`) which cannot be inferred from the `v128` type. Extract lane values and compare them individually instead:
>```typescript
>const v: v128 = i32x4(10, 20, 30, 40);
>expect(i32x4.extract_lane(v, 0)).toBeGreaterThan(5);
>```

### `toBeGreaterThanOrEqual()`
Checks that a value is greater than or equal to the expected value. Same type support, cross-type rules, and error conditions as [`toBeGreaterThan()`](#tobegreaterthan).

```typescript
expect(10).toBeGreaterThanOrEqual(10);
expect(3.14).toBeGreaterThanOrEqual(3);
```

### `toBeLessThan()`
Checks that a value is less than the expected value. Same type support, cross-type rules, and error conditions as [`toBeGreaterThan()`](#tobegreaterthan).

```typescript
expect(5).toBeLessThan(10);
expect(3).toBeLessThan(3.14);
expect("apple").toBeLessThan("banana");
```

### `toBeLessThanOrEqual()`
Checks that a value is less than or equal to the expected value. Same type support, cross-type rules, and error conditions as [`toBeGreaterThan()`](#tobegreaterthan).

```typescript
expect(5).toBeLessThanOrEqual(5);
expect(3).toBeLessThanOrEqual(3.14);
```

### Planned Matchers
`toBeDefined`, `toBeUndefined`, `toContain`, `toContainEqual`

### Likely Matchers
`toBeOneOf`, `toBeTypeOf`, `toBeInstanceOf`, `toHaveProperty`, `toMatch`
