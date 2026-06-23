/**
 * Switch-branch parity twin (v8 oracle) — mirrors the AS fixture
 * coverage-collection/branch/switch.meta.ts construct-for-construct (same shapes,
 * same source order), and via branch/switch.test.ts the same inputs, so v8's
 * switch branch coverage is the comparison oracle for the AS provider. Compared in
 * meta-verify/coverage-collection/branch/switch.test.ts.
 */

// Clean switch: every case has its own body, explicit default.
export function category(val: number): number {
  switch (val) {
    case 1:
      return 10;
    case 2:
      return 20;
    default:
      return -1;
  }
}

// Empty fall-through: case 0 (empty) shares case 6's body; case 1 (empty) shares
// case 2's body; explicit default.
export function dayType(day: number): number {
  let r = 0;
  switch (day) {
    case 0:
    case 6:
      r = 1;
      break;
    case 1:
    case 2:
      r = 2;
      break;
    default:
      r = 0;
  }
  return r;
}

// Switch WITHOUT an explicit default (the "no case matched" path is the implicit
// default arm).
export function classifySign(n: number): number {
  let r = 0;
  switch (n) {
    case 0:
      r = 10;
      break;
    case 1:
      r = 20;
      break;
  }
  return r;
}

// Break-only case (matched, runs no body) — counted via its break, not derived.
export function firstOnly(n: number): number {
  let r = -1;
  switch (n) {
    case 0:
      break;
    case 1:
      r = 1;
      break;
    default:
      r = 99;
  }
  return r;
}

// Trailing empty case falling into default.
export function emptyTrailing(n: number): number {
  let r = 0;
  switch (n) {
    case 1:
      r = 10;
      break;
    case 2:
    default:
      r = 99;
  }
  return r;
}

// Body-bearing fall-through (no break): entered counts accumulate down the chain.
// The fall-through is intentional (mirrors the AS cumulative fixture); suppressed
// because the twin's tsconfig sets noFallthroughCasesInSwitch.
export function cumulative(n: number): number {
  let r = 0;
  switch (n) {
    // @ts-ignore intentional fall-through
    case 1:
      r += 1;
    // @ts-ignore intentional fall-through
    case 2:
      r += 2;
    default:
      r += 4;
  }
  return r;
}

// Negative, large, and sparse case literals.
export function signBucket(n: number): number {
  switch (n) {
    case -5:
      return 1;
    case 1000:
      return 2;
    case 7:
      return 3;
    default:
      return 0;
  }
}

// Enum-like labels (Red=0, Green=1, Blue=2) — the AS fixture uses an enum.
const Red = 0, Green = 1, Blue = 2;
export function colorName(c: number): number {
  switch (c) {
    case Red:
      return 1;
    case Green:
      return 2;
    case Blue:
      return 3;
    default:
      return 0;
  }
}

// Nested switch: an inner switch inside an outer case.
export function grid(x: number, y: number): number {
  switch (x) {
    case 0:
      switch (y) {
        case 0:
          return 1;
        default:
          return 2;
      }
    default:
      return 3;
  }
}

// Explicit default in the MIDDLE of the case list (arms reported in source order).
export function midDefault(n: number): number {
  switch (n) {
    case 1:
      return 1;
    default:
      return 0;
    case 2:
      return 2;
  }
}
