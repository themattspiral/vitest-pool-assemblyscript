/**
 * @inline helper for the inlined-branch meta-verify case. With stripInline:false
 * (the as-pool-meta-no-strip-inline project) the @inline decorator is HONORED, so
 * this function's body — including its if-branch — is inlined into its caller in
 * another file. The inlined branch's located expressions keep pointing back HERE
 * (this file), and the branch must be attributed to this source, not the caller's
 * (the "keep @inline foreign locations — genuinely executed" behavior).
 */
@inline
export function inlineGate(n: i32): i32 {
  if (n > 0) {
    return 1;
  } else {
    return -1;
  }
}
