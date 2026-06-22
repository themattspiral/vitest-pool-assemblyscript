/**
 * Caller for the inlined-statement case. computeStat (an @inline function from another
 * file) is inlined here with stripInline:false. Its statements execute as part of
 * useComputeStat but are attributed to inline-helper.meta.ts. Exercised by
 * statement/inline.meta-no-strip-inline.test.ts; assertions in .../statement/inline.test.ts.
 */
import { computeStat } from "./inline-helper.meta";

export function useComputeStat(n: i32): i32 {
  return computeStat(n);
}
