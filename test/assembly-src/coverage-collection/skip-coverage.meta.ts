// Coverage source for skipped test coverage scenario.
// Tests verify that skipped tests produce no phantom coverage counts,
// while non-skipped tests in the same file still collect coverage normally.

export function coveredByNonSkip(): i32 {
  return 42;
}

export function onlyInSkipped(): i32 {
  return 0;
}
