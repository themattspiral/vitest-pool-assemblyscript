// Exercises the runtime-dependent coverage behaviors. This source is compiled under
// BOTH the default (stub) runtime and `--runtime incremental` -- by the sibling tests
// runtime-coverage.meta.test.ts (as-pool-meta, stub) and
// runtime-coverage.meta-incremental.test.ts (as-pool-meta-incremental) -- and the
// provider accumulates the two binaries' coverage by source position. The companion
// meta-verify suite asserts the accumulated counts, guarding two fixes:
//   - the representative location is found breadth-first, so a function the incremental
//     GC runtime would otherwise drop from instrumentation is still instrumented; and
//   - per-function hits are SUMmed across positions, so a function whose rep-location
//     drifts between runtimes is not under-counted.

class Box {
  v: i32;
  constructor(n: i32) { this.v = n; }
}

// Under the incremental runtime the body block's direct children are the runtime's
// unlocated allocation bookkeeping, so without the breadth-first rep-location search
// this function has no representative location and is skipped from instrumentation
// entirely -- it would read 0 under incremental, and the accumulated count would
// under-report.
export function skipUnderIncremental(): i32 {
  if (true) {
    const c = new Box(5);
    return c.v;
  }
  return -1;
}

// `new Box(7)`'s allocation displaces the first statement deeper under the incremental
// runtime, so this function's representative location is a different source position per
// runtime. Its hits split across two positions that only sum to the true total with the
// per-function SUM combiner.
export function driftAcrossRuntimes(): i32 {
  const c = new Box(7);
  const w = c.v + 1;
  return w;
}
