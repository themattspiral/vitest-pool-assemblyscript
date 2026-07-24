/**
 * The pool's *portable* AssemblyScript layer: values shared between the pool's
 * AS half (assembly/, compiled by the user's asc) and TS half (src/, compiled
 * by tsc/tsdown) — not standalone literals, but one definition consumed on
 * both sides of the WASM boundary.
 *
 * This directory's tsconfig extends `assemblyscript/std/portable.json`, which
 * declares and ENFORCES the portability contract: an AS-only type or builtin
 * added here is caught at check time instead of surfacing later as an asc/tsc
 * mismatch. Keep it free of AS-only types and builtins - see:
 * https://www.assemblyscript.org/compiler.html#portability
 */

export enum TestOptionValue {
  OptionUndefined = -1,
  OptionFalse = 0,
  OptionTrue = 1
}

export enum LifecycleHookKind {
  BeforeEach = 0,
  AfterEach = 1
}
