# Matcher Research: AssemblyScript Operator Behavior

Empirical findings from testing AS compiler behavior across the type matrix, used to inform matcher design decisions.

## Operator Support Matrix

Tested with AssemblyScript 0.28+ compiler. Each cell indicates whether the AS compiler accepts the operator between the two types at compile time.

| Type Combination | `==` (equality) | `>` `<` `>=` `<=` (inequality) |
|---|---|---|
| Same-type integers | allowed | allowed |
| Cross-size same-sign integers (e.g. `i8` vs `i64`) | allowed | allowed |
| Cross-sign integers (e.g. `i32` vs `u32`) | allowed | **rejected** |
| Same-type floats | allowed | allowed |
| Cross-type floats (`f32` vs `f64`) | allowed | allowed |
| Float/int — small int (e.g. `f32` vs `i8`, `f64` vs `i32`) | allowed | allowed |
| Float/int — precision loss (e.g. `f32` vs `i32`, `f64` vs `i64`) | **rejected** | **rejected** |
| `bool` vs `bool` | allowed | allowed |
| `bool` vs integer | allowed | allowed |
| `string` vs `string` | allowed | allowed |

### Key Finding: Cross-Sign Integer Inequality

AS rejects all cross-sign integer inequality comparisons at compile time (e.g. `i32 > u32`, `i8 < u64`), even though it allows cross-sign equality (`i32 == u32`). This is stricter for inequality than for equality.

### Key Finding: Booleans and Strings

AS allows inequality operators on both booleans and strings, which was not initially expected.

---

## Matcher Design Decisions

### Cross-sign integers: permissive (all matchers)

Our matchers are **more permissive** than raw AS for cross-sign integer comparisons. We handle these safely with promotion logic:
- If the signed value is negative: deterministic result without promotion (negative signed is always less than any unsigned)
- Otherwise: both values are non-negative, so compare as `u64`

This applies to both equality matchers (`toBe`, `toEqual`) and inequality matchers (`toBeGreaterThan`, etc.). There is no precision loss or false positive risk — the compiler restriction is a language-level design choice, not a safety concern.

### Float/integer precision loss: rejected (all matchers)

Combinations where `sizeof(integer) >= sizeof(float)` are rejected with a descriptive error, matching AS compiler behavior. The float's mantissa cannot losslessly represent the integer type's full range, which can produce incorrect results for both equality and inequality.

Rejected combinations:
- `f32` vs `i32`, `u32`, `i64`, `u64`
- `f64` vs `i64`, `u64`

See the precision loss counterexamples in:
- `test/assembly/expect-matchers/to-be-mixed-numerical-types.as.test.ts` (equality)
- `test/assembly/expect-matchers/inequality.as.test.ts` (inequality)

### Booleans

- **Equality (`toBe`)**: rejects `bool` vs non-`bool` (booleans are not interchangeable with integers for identity)
- **Deep equality (`toEqual`)**: allows `bool` vs integer (e.g. `true` equals `u8(1)`) via numeric promotion
- **Inequality**: allowed — booleans are treated as numeric (true=1, false=0), matching AS language behavior

### Strings

- **Equality (`toBe`, `toEqual`)**: compared by value
- **Inequality**: allowed — lexicographic comparison (Unicode code point order), matching AS language behavior. Nullable strings where either value is null throw an error.

---

## Error Type Analysis

All comparison functions can produce errors via two mechanisms:
1. **`throw`** — halts WASM execution via `abort()`, reported as `WASMRuntimeError`
2. **`__vitest_assemblyscript_EqualityResult.TypeMismatch` return** — allows the matcher to produce an `AssertionError` with an informative suffix

The distinction matters for `.not` inversion because of the execution order in `toEqual`:

```
toEqual<U>(val: U): void {
    const result = equals(this.actual, val);         // LINE A: comparison
    this.assertComparison(result == __vitest_assemblyscript_EqualityResult.Equal, ...);  // LINE B: assertion + .not
}
```

`equals()` (LINE A) runs BEFORE `assertComparison()` (LINE B), where `.not` inversion lives. If `equals()` **throws** at LINE A, execution never reaches LINE B — `.not` cannot run, and the test crashes with `WASMRuntimeError` regardless of inversion. If `equals()` **returns** `TypeMismatch`, LINE B is reached, `result == Equal` evaluates to `false`, and `.not` can invert it to a pass.

### Why `TypeMismatch` is a return value, not a throw

User-defined class runtime type mismatches (e.g. `Shape`-typed Circle vs `Shape`-typed Square) are the one case where `.not` is a legitimate assertion: `expect(circleAsShape).not.toEqual(squareAsShape)` should pass, because they genuinely are not equal. With a throw, this assertion would crash. With a `TypeMismatch` return, `equals()` returns normally, `toEqual` evaluates `result == Equal` (false), passes that to `assertComparison`, and `.not` inverts it to a pass.

All other type error cases throw, because they represent programmer mistakes where `.not` would not produce a meaningful assertion.

### Throw paths by location

#### `compare.ts`

| # | Function | Line(s) | Condition | Reachable from | `.not` relevant? |
|---|---|---|---|---|---|
| 1 | `mapEquals` | 104 | Map key types differ (`nameof<indexof<T>>() != nameof<indexof<U>>()`) | `toEqual`/`toStrictEqual` via `equals()` → `mapEquals()` | No — incompatible key types |
| 2 | `identical` | 214 | Reference vs value type, non-null actual (`isReference<T>() && !isReference<U>()`) | `toBe`; also `toEqual`/`toStrictEqual` via `equals()` → `identical()` | No — fundamentally incomparable types |
| 3 | `identical` | 224 | Value type vs reference, non-null expected (`!isReference<T>() && isReference<U>()`) | `toBe`; also `toEqual`/`toStrictEqual` via `equals()` → `identical()` | No — fundamentally incomparable types |
| 4 | `identical` | 257, 266 | Float/int precision loss (`sizeof(integer) >= sizeof(float)`) | `toBe`; also `toEqual`/`toStrictEqual` via `equals()` → `identical()` | No — use `toBeCloseTo` or cast to f64 |
| 5 | `identical` | 280 | Catch-all: types that don't match any known category (e.g. `v128` vs non-vector) | `toBe`; also `toEqual`/`toStrictEqual` via `equals()` → `identical()` | No — incompatible types |
| 6 | `closeTo` | 313 | `v128` vector passed to approximate comparison | `toBeCloseTo` | No — wrong matcher for type; extract lanes instead |
| 7 | `equals` | 394 | `isManaged<T>() != isManaged<U>()` | `toEqual`/`toStrictEqual` | No — fundamental memory layout incompatibility |
| 8 | `equals` | 425 | Managed rtId mismatch, no `__vitest_assemblyscript_deep_equals` (non-user container/reference types) | `toEqual`/`toStrictEqual` | No — incompatible types without deep equality support |
| 9 | `equals` | 442 | Unmanaged type name mismatch, no `__vitest_assemblyscript_deep_equals` | `toEqual`/`toStrictEqual` | No — different unmanaged types |
| 10 | `compareInequality` | 524 | Null string with inequality operator | `toBeGreaterThan`, `toBeGreaterThanOrEqual`, `toBeLessThan`, `toBeLessThanOrEqual` | No — result is undefined; use `toBeNull()` |
| 11 | `compareInequality` | 534 | Non-string reference type (objects, arrays) | All 4 inequality matchers | No — reference types are not orderable |
| 12 | `compareInequality` | 546, 555 | Float/int precision loss (same as #4) | All 4 inequality matchers | No — same as #4 |
| 13 | `compareInequality` | 609 | Unsupported type catch-all (e.g. vectors) | All 4 inequality matchers | No — wrong matcher for type |

#### `expect.ts`

| # | Function | Line(s) | Condition | Reachable from | `.not` relevant? |
|---|---|---|---|---|---|
| 14 | `toThrowError` | 544 | Non-function value passed to `expect()` | `toThrowError`/`toThrow` | N/A — `InvertedExpectMatcher` does not have `toThrowError` |

### Return-value error paths (non-throw)

| # | Function | Line(s) | Condition | Returned value | Reachable from | `.not` relevant? |
|---|---|---|---|---|---|---|
| 1 | `equals` | 419 | Managed user-defined class rtId mismatch (has `__vitest_assemblyscript_deep_equals`) | `__vitest_assemblyscript_EqualityResult.RuntimeTypeMismatch` | `toEqual`/`toStrictEqual` | **Yes** — the only case where `.not` is legitimate |
| 2 | `equals` | 437 | Unmanaged user-defined class name mismatch (has `__vitest_assemblyscript_deep_equals`) | `__vitest_assemblyscript_EqualityResult.RuntimeTypeMismatch` | `toEqual`/`toStrictEqual` | **Yes** — same rationale as managed case |

---

## Deep Equality Design

AssemblyScript has no runtime reflection, so structural deep equality for user-defined objects cannot be implemented in the matcher alone — the matcher has no way to enumerate an arbitrary class's fields at runtime. The AS ecosystem's solution is compiler transforms, which inject per-class methods at the `afterParse` phase of compilation. This pool uses that approach.

### Injected methods

A compiler transform ([`src/compiler/transforms/deep-equals.mts`](../src/compiler/transforms/deep-equals.mts)) walks user source classes and injects three methods into each one:

- **`__vitest_assemblyscript_deep_equals(other: usize): EqualityResult`** — structural comparison. If the class defines `@operator("==")`, delegates to `this == other`. If the class defines `.equals()`, delegates to that. Otherwise generates a field-by-field comparison body, with each field routed through a `@global` bridge function that wraps the pool's `equals()` function in `compare.ts`. Uses a uniform `usize` parameter for inheritance compatibility (AS treats same-named child methods as overrides requiring compatible parameter types).
- **`__vitest_assemblyscript_typename(): string`** — returns `nameof<ClassName>()`. Virtual dispatch ensures the correct runtime class name is returned even when the variable is typed as a base class. Used to build runtime type mismatch suffixes and to produce type names in failure output for RTM cases.
- **`__vitest_assemblyscript_stringify(): string`** — returns comma-separated `fieldName: value` entries for all stored instance fields. Always stringifies all fields regardless of `@operator("==")`/`.equals()` — stringify shows full object state, not equality-relevant fields only. Follows the super chain via `isDefined(super.__vitest_assemblyscript_stringify)` guard, same pattern as deep equality.

### Comparison flow

All comparisons flow through `equals()` in `compare.ts`, which dispatches based on the operand types:

- Primitives, strings, vectors → `identical()`
- Arrays, StaticArray, TypedArray → `arrayEquals()` (recursive per element)
- `Set` → `setEquals()` (order-independent, scans for match)
- `Map` → `mapEquals()` (key types must match, values support cross-type)
- `ArrayBuffer` → `arrayBufferEquals()` (byte-level word-aligned comparison)
- Managed vs unmanaged type mismatch → throws (memory layout incompatibility)
- Managed types with mismatched `rtId` → `RuntimeTypeMismatch` (user classes) or throws (containers)
- Unmanaged types with mismatched `nameof` → `RuntimeTypeMismatch` (user classes) or throws
- User-defined reference types → delegates to injected `__vitest_assemblyscript_deep_equals`

Runtime type checking for managed objects reads `rtId` directly from the AS object header (offset -8 from the object pointer). This catches polymorphic mismatches where both operands share a compile-time base type but have different runtime types (e.g. `Shape`-typed `Circle` vs `Shape`-typed `Square`). Unmanaged types fall back to compile-time `nameof` checks because they have no object header.

### Comparison path context

As `equals()` recurses into containers and transform-generated field comparisons, segments are pushed onto a module-level `string[]` stack (e.g. `"[0]"`, `"[\"key\"]"`, `".fieldName"`). The stack uses push/pop discipline — segments are popped on `Equal`, left in place on non-`Equal`. As non-`Equal` propagates up the call stack, the path accumulates to the deepest mismatch point. At the top level, `toEqual`/`toStrictEqual` read the path and include it in the assertion failure suffix.

### RTM type name capture

When `equals()` detects a runtime type mismatch for user-defined classes, it captures the actual and expected runtime type names via `__vitest_assemblyscript_typename()` into module-level globals. `toEqual`/`toStrictEqual` read these globals into the assertion suffix as `: ActualType vs ExpectedType`. This tells the user *what types* mismatched without requiring them to inspect the compile-time declarations.

### Scoping and library class inheritance

The transform is scoped to user source files only — not `node_modules`, not AS stdlib. Library classes do not receive the injected methods. When a user class extends a library class:

- The super chain check `isDefined(super.__vitest_assemblyscript_deep_equals)` returns false at the user/library boundary
- Only the user class's own declared fields are compared; inherited library fields are silently excluded from comparison
- The same applies to `__vitest_assemblyscript_stringify` — library-inherited fields are not included in the stringified output

This is an intentional scoping tradeoff: transforming library code would affect every test binary, cross compilation boundaries, and risk breaking library internals. The limitation is documented in the user-facing matcher docs.

Note that the "what fields are visible" scope for comparison and stringify happen to match for library inheritance (both exclude library fields), but they can diverge in the custom equality case: `@operator("==")` or `.equals()` may compare only a subset of the class's stored fields, while stringify always shows all stored fields. Users may see fields in the failure output that were not actually part of the comparison.

### Cycle detection

Self-referential or mutually-referential objects would cause infinite recursion in both the comparison chain (`equals()` → `__vitest_assemblyscript_deep_equals` → `equals()`) and the stringify chain (`stringifyValue()` → `__vitest_assemblyscript_stringify` → `stringifyValue()`). AS has no try/catch, so the resulting WASM stack overflow cannot be caught — it must be prevented.

Two independent mechanisms, tuned to each chain's needs:

- **Comparison cycle detection** (`compare.ts`): `Set<u64>` tracking `(actualPtr, expectedPtr)` pairs currently being compared. Pairs are packed as `(u64(actualPtr) << 32) | u64(expectedPtr)`. Entries are added when a reference comparison begins and are never individually removed — if a pair was previously `Equal`, revisiting returns `Equal` (correct); if `NotEqual`, we already returned and won't revisit. Cleared at `toEqual`/`toStrictEqual` entry. Rationale: the comparison operates within a single `toEqual` call, so add-only plus bulk clear is correct and simpler than add/remove.

- **Stringify cycle detection** (`utils.ts`): `Set<usize>` tracking pointers currently being stringified. Uses add-on-entry, remove-on-exit discipline — not add-only. This is necessary because `stringifyValue` is called twice per assertion (once for actual, once for expected), and the same pointer may legitimately appear in both calls (e.g. `expect(point).toEqual(point)`). With add-only, the second call would falsely detect a cycle. With add/remove, entries are cleaned up when each `stringifyValue` call completes, so the set is naturally empty between the two top-level calls and no external clearing is needed. When a cycle is detected, `stringifyValue` returns `"[Circular]"` instead of recursing.

Both mechanisms cover all cycle shapes: self-reference (`a.next = a`), mutual reference (`a.other = b, b.other = a`), and cycles through containers (`a.items[0] = a`).
