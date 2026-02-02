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
