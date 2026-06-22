/**
 * Caller for the inlined-branch case. inlineGate (an @inline function from another
 * file) is inlined here when compiled with stripInline:false. The inlined if-branch
 * executes as part of this function, but its coverage is attributed to
 * branch-inline-helper.meta.ts (where the branch is written) — the "@inline foreign
 * locations are kept" behavior. Exercised by
 * branch-inline.meta-no-strip-inline.test.ts; assertions live in
 * test/meta-verify/coverage-collection/branches-inline.test.ts.
 */
import { inlineGate } from "./inline-helper.meta";

export function useInlineGate(n: i32): i32 {
  return inlineGate(n);
}
