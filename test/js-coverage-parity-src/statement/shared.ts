// Cross-file shared statement parity twin — imported by shared-a.test.ts (pick(true))
// and shared-b.test.ts (pick(false)). v8 accumulates both files' coverage of this
// module; the merged then/else arms are the parity target for the AS cross-binary
// accumulation. KEEP LINE-ALIGNED (header line count matches the AS fixture).

export function pick(flag: boolean): number {
  let result = 0;
  if (flag) {
    result = 1;
  } else {
    result = 2;
  }
  return result;
}
