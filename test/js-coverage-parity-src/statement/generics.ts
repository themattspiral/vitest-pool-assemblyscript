// Generic statement parity twin (v8 oracle) — mirrors the AS fixture line-for-line.
// JS has no monomorphization, so clamp is ONE function called twice; v8's per-line
// counts are the parity target for the AS SUM-across-instances.

export function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

export function useI32(): number {
  return clamp(5, 0, 10);
}

export function useF64(): number {
  return clamp(15.0, 0.0, 10.0);
}
