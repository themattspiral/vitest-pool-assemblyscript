/**
 * Top-level executable code coverage verification.
 * Tests whether module-scope code outside any function is tracked.
 */

/** Regular function — should be tracked normally */
export function helper(x: i32): i32 {
  return x * 2;
}

/** Top-level computation — is this tracked? */
export const COMPUTED: i32 = helper(21);

/** Another top-level computation */
export const DOUBLE_COMPUTED: i32 = helper(COMPUTED);

/** Simple constant — no function call, just a literal */
export const LITERAL: i32 = 100;

/** Regular function that reads the computed values */
export function readComputed(): i32 {
  return COMPUTED + DOUBLE_COMPUTED;
}
