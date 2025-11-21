
export function increment(a: number): number {
  return a + 1;
}

export function fails(): number {
  // @ts-ignore
  return nonexistant;
}

// This function won't be called in tests - should show 0% coverage
export function unusedFunction(): string {
  return 'never called JS function';
}
