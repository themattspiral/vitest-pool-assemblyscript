/**
 * Shared-source branch fixture for meta-verify. This one function is imported by
 * TWO test files (branch-shared-a / branch-shared-b), so it is compiled into two
 * separate WASM binaries. Its branch hits must accumulate across both binaries by
 * the source-derived decision key (the D7 stability invariant). File A exercises
 * the THEN arm and file B the ELSE arm, so the accumulated [2,1] is only correct if
 * both binaries' hits are summed. Assertions live in
 * test/meta-verify/coverage-collection/branches-shared.test.ts.
 */
export function sharedBranch(n: i32): i32 {
  if (n > 0) {
    return 1;
  } else {
    return -1;
  }
}
