/**
 * Branch-FILING fixtures for meta-verify. These reproduce the foreign-inlined-
 * default-param shape: a branch arm whose FIRST LOCATED expression belongs to
 * another file (the inlined default Const of `new Box()`), not the home file.
 *
 * A binary decision is filed under the file of one of its located arm expressions.
 * The home-file arm-location fix prefers an arm's first HOME-file located
 * expression (the function's own file), skipping foreign inlined ones — so the
 * decision is filed under THIS file and the source branch matches. Without the fix
 * the decision was filed under the class file, this file's branch found no decision
 * in its bucket, and both arms read 0 (`[0,0]`).
 *
 * Each function is exercised in branch-filing.meta.test.ts; assertions live in
 * test/meta-verify/coverage-collection/branches-filing.test.ts.
 */
import { Box } from "./filing-class.meta";

// if-arm with a foreign-inlined-default then-arm (`new Box()`): the known repro of
// the filing bug. The fix files this decision under the home file → [1,1].
export function useDefaultCtorIf(a: i32): i32 {
  if (a < 1) {
    const c: Box = new Box();
    return c.value;
  } else {
    return a + 1;
  }
}

// Control: explicit ctor arg → the then-arm's first located expression is in THIS
// (home) file, so filing always worked, with or without the fix.
export function useExplicitCtorIf(a: i32): i32 {
  if (a < 1) {
    const c: Box = new Box(5);
    return c.value;
  } else {
    return a + 1;
  }
}

// Ternary (cond-expr) arm with the same foreign-inlined-default then-arm
// (`new Box().value`): exercises home-file arm filing for cond-expr arms too.
export function pickDefaultCtor(a: i32): i32 {
  return a < 1 ? new Box().value : a + 1;
}
