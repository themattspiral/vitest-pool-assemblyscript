export function increment(a: i32): i32 {
  return a + 1;
}

export function fails(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}

// This function won't be called in tests - should show 0% coverage
export function unusedFunction(): string {
  return 'never called AS function';
}
