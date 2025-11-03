/**
 * Utilities for sourcemap accuracy testing
 */

// Helper function that will error via array bounds
export function helperThatFails(): void {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
}

export function nestedHelperThatFails(): void {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
}

export function outerHelper(): void {
  nestedHelperThatFails();
}
