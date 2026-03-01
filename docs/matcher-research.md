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
2. **`EqualityResult.TypeMismatch` return** — allows the matcher to produce an `AssertionError` with an informative suffix

The distinction matters for `.not` inversion because of the execution order in `toEqual`:

```
toEqual<U>(val: U): void {
    const result = equals(this.actual, val);         // LINE A: comparison
    this.assertComparison(result == EqualityResult.Equal, ...);  // LINE B: assertion + .not
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
| 1 | `assertSameContainerGeneric` | 30 | Container rtIds differ (e.g. `Set<i32>` vs `Set<string>`) | `toEqual`/`toStrictEqual` via `arrayEquals`, `setEquals`, `mapEquals` | No — wrong generic instantiation types |
| 2 | `identical` | 224–239 | Float/int precision loss (`sizeof(integer) >= sizeof(float)`) | `toBe`; also `toEqual`/`toStrictEqual` via `equals()` → `identical()` | No — use `toBeCloseTo` or cast to f64 |
| 3 | `identical` | 247–248 | Catch-all: types that don't match any known category | `toBe`; also `toEqual`/`toStrictEqual` via `equals()` → `identical()` | **TODO** — currently returns `false` with a `// TODO - throw?` comment. Needs decision on whether to throw or silently return false |
| 4 | `closeTo` | 278 | `v128` vector passed to approximate comparison | `toBeCloseTo` | No — wrong matcher for type; extract lanes instead |
| 5 | `equals` | 349 | `isManaged<T>() != isManaged<U>()` | `toEqual`/`toStrictEqual` | No — fundamental memory layout incompatibility |
| 6 | `equals` | 368 | Managed rtId mismatch, no `__vitest_assemblyscript_deep_equals` (non-user container/reference types) | `toEqual`/`toStrictEqual` | No — incompatible types without deep equality support |
| 7 | `equals` | 381 | Unmanaged type name mismatch, no `__vitest_assemblyscript_deep_equals` | `toEqual`/`toStrictEqual` | No — different unmanaged types |
| 8 | `compareInequality` | 463 | Null string with inequality operator | `toBeGreaterThan`, `toBeGreaterThanOrEqual`, `toBeLessThan`, `toBeLessThanOrEqual` | No — result is undefined; use `toBeNull()` |
| 9 | `compareInequality` | 473 | Non-string reference type (objects, arrays) | All 4 inequality matchers | No — reference types are not orderable |
| 10 | `compareInequality` | 485–500 | Float/int precision loss (same as #2) | All 4 inequality matchers | No — same as #2 |
| 11 | `compareInequality` | 548 | Unsupported type catch-all (e.g. vectors) | All 4 inequality matchers | No — wrong matcher for type |

#### `expect.ts`

| # | Function | Line(s) | Condition | Reachable from | `.not` relevant? |
|---|---|---|---|---|---|
| 12 | `toThrowError` | 531 | Non-function value passed to `expect()` | `toThrowError`/`toThrow` | N/A — `InvertedExpectMatcher` does not have `toThrowError` |

### Return-value error paths (non-throw)

| # | Function | Line(s) | Condition | Returned value | Reachable from | `.not` relevant? |
|---|---|---|---|---|---|---|
| 1 | `equals` | 364 | Managed user-defined class rtId mismatch (has `__vitest_assemblyscript_deep_equals`) | `EqualityResult.TypeMismatch` | `toEqual`/`toStrictEqual` | **Yes** — the only case where `.not` is legitimate |
| 2 | `equals` | 379 | Unmanaged user-defined class name mismatch (has `__vitest_assemblyscript_deep_equals`) | `EqualityResult.TypeMismatch` | `toEqual`/`toStrictEqual` | **Yes** — same rationale as managed case |
