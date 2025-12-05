export function increment(a: i32): i32 {
  return a + 1;
}

// This function won't be called in tests - should show 0% coverage
export function unusedFunction(): string {
  return 'never called AS function';
}
