/**
 * Functions that trap/abort during execution.
 * Verifies that entry counting means trapping functions
 * still register as covered (count > 0).
 */

export function calledBeforeTrap(): i32 {
  return 42;
}

export function willTrap(): void {
  const arr: i32[] = [1, 2, 3];
  const _value = arr[10]; // out of bounds — will abort
}
