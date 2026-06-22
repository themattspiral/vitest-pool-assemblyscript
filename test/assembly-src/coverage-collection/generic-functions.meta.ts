/**
 * Generic function coverage verification.
 * Monomorphized variants should be summed into the source function's hit count.
 */

export function identity<T>(value: T): T {
  return value;
}

export function isNull<T>(value: T | null): bool {
  return value === null;
}

/** Non-generic for comparison */
export function nonGeneric(value: i32): i32 {
  return value;
}
