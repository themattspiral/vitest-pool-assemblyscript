/**
 * @inline helper for the inlined-STATEMENT meta-verify case. With stripInline:false
 * (the as-pool-meta-no-strip-inline project) the @inline decorator is HONORED, so this
 * body's statements are inlined into the caller in another file. The inlined statements
 * keep pointing back HERE, so their coverage is attributed to this source (genuinely-
 * executed @inline code is kept), even though the standalone function is never called
 * (0 function hits — the differentiator). Exercised by
 * statement/inline.meta-no-strip-inline.test.ts; assertions in .../statement/inline.test.ts.
 */
@inline
export function computeStat(n: i32): i32 {
  let doubled = n * 2;
  let result = doubled + 1;
  return result;
}
