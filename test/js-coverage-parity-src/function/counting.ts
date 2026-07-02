/**
 * Function hit-count parity twin (v8 oracle) — mirrors the AS fixture
 * coverage-collection/function/counting.meta.ts line-for-line, with identical call
 * counts via function/counting.test.ts, so v8's function coverage is the oracle.
 * Compared in meta-verify/coverage-collection/function/counting.test.ts.
 */

export function calledOnce(): number {
  return 1;
}

export function calledTwice(): number {
  return 2;
}

export function calledThrice(): number {
  return 3;
}

export function calledFiveTimes(): number {
  return 5;
}

export function neverCalled(): number {
  return 0;
}

// Recursion: each call is a fresh function entry, so countdown(4) yields 5 entries.
export function countdown(n: number): number {
  if (n <= 0) {
    return 0;
  }
  return countdown(n - 1);
}

// Generic: in TS a single function called with multiple types; its one hit count
// equals the AS sum across monomorphized specializations.
export function identity<T>(value: T): T {
  return value;
}
