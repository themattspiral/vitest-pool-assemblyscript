// Cross-file shared statement fixture — imported by shared-a.meta.test.ts (pick(true))
// and shared-b.meta.test.ts (pick(false)), compiled into two binaries. The provider
// accumulates statement hits by file+position across binaries, so the then/else
// arms each accrue from a different binary. KEEP LINE-ALIGNED with the twin.

export function pick(flag: bool): i32 {
  let result = 0;
  if (flag) {
    result = 1;
  } else {
    result = 2;
  }
  return result;
}
