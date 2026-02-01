
# Matchers API

This project aims to follow the [vitest/jest `expect()` API](https://vitest.dev/api/expect.html) as closely as possible, with some necessary differences given AssemblyScript's static-typing. 

The following subset of vitest/jest expect matchers are currently supported:

### `.not`
Inverts the matcher that follows. Can be chained.
```typescript
expect(1).not.toBe(2);
expect("hello").not.toBeNull();
```

### `toBe()`
Checks that a value is what you expect. Primitives and strings are compared directly, and references are checked for reference equality only (including objects and arrays). These comparisons are done using `==`, although it is forgiving of numeric type differences.

Don't use `toBe` with floating-point numbers - see `toBeCloseTo()` instead.
```typescript
expect(1 + 1).toBe(2);
expect("hello").toBe("hello");
```

> ⚠️ IMPORTANT: this matcher is currently too permissive with type comparison - it deems some numeric values of different types to be the same when they shouldn't actually be. The `toEqual()` matcher is more appropriate for these permissive semantics. Fix coming soon!

### `toBeCloseTo()`
Checks if a floating point value is close to what you expect. Using exact equality with floating point numbers often doesn't work correctly, because small internal rounding occurs to be able to represent floats in binary. This rounding means intuitive comparisons will often fail.

Comparing strings, integers, or references will fall back to using a `toBe` comparison.

Accepts an additional `precision: i32` argument - Number of decimal places that must match for values to be considered close. Defaults to 2 digits, meaning effectively that values must be within 0.005 of each other.
```typescript
expect(0.1 + 0.2).toBeCloseTo(0.3);
expect(1.005).toBeCloseTo(1.0, 1);
```

### `toEqual()`
Checks that two values have the same value (deep equality). Currently supports checking equality of Arrays, Sets, Maps, and nulls. Values inside arrays are compared using `toEqual()` also, while Maps and Sets use their respective rules for membership.

Primitives, strings, and other object references are compared with `toBe()` rules.

> ⚠️ IMPORTANT: Does not yet support user-defined object deep equality checking. Coming soon!

```typescript
expect([1, 2, 3]).toEqual([1, 2, 3]);
expect(["one", "two", "three"]).toEqual(["one", "two", "three"]);

// objects use reference equality (deep equality not yet supported)
const a: MyObject = new MyObject();
const b: MyObject = new MyObject();
expect([a, b]).toEqual([a, b]);
```

### `toStrictEqual()`
Alias for `toEqual()`. Currently no differences in AssemblyScript.

### `toBeTruthy()` & `toBeFalsey()`
Check that a value is truthy or falsey.

Falsey values in AssemblyScript are `0`, `false`, `NaN`, and `null`.

```typescript
expect(1).toBeTruthy();
expect("hello").toBeTruthy();
expect("").toBeTruthy();  // <-- Empty String is TRUTHY in AS!

expect(0).toBeFalsey();
expect(NaN).toBeFalsey();
expect(null).toBeFalsey();
```

>⚠️ AS Quirk: Unlike in JavaScript, empty string is truthy in AssemblyScript because it is an object reference, not a primitive. An empty string is still an allocated object with a non-zero address, so it evaluates as truthy!

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

### Planned Matchers
`toBeDefined`, `toBeUndefined`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`, `toBeLessThan`, `toBeLessThanOrEqual`, `toContain`, `toContainEqual`

### Likely Matchers
`toBeOneOf`, `toBeTypeOf`, `toBeInstanceOf`, `toHaveProperty`, `toMatch`
