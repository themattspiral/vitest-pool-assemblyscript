// Coverage source for cross-file coverage merging scenario.
// This single source file is imported by two different test files.
// Tests verify that hit counts are correctly summed across both files' test runs.

export function sharedFunc(): i32 {
  return 100;
}

export function fileAOnly(): i32 {
  return 200;
}

export function fileBOnly(): i32 {
  return 300;
}
