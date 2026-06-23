// Generic (monomorphized) statement fixtures — a generic clamp<T> instantiated at
// i32 and f64. AS compiles two functions but attributes both to clamp's single
// source, so statement hits SUM across instances. Driven in generics.meta.test.ts;
// assertions in .../statement/generics.test.ts. KEEP LINE-ALIGNED with the twin.

export function clamp<T>(v: T, lo: T, hi: T): T {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

export function useI32(): i32 {
  return clamp<i32>(5, 0, 10);
}

export function useF64(): f64 {
  return clamp<f64>(15.0, 0.0, 10.0);
}
