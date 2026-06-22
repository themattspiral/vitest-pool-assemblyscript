import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
} from '../../helpers/shared.js';

const GENERICS = `${COV_DIR}/branch/generics.meta.ts`;

// Per-arm branch hit counts for branch/generics.meta.ts. Each branch lives in a
// generic function compiled once per type argument; the per-arm counts must SUM
// across the i32 and f64 instances (one source branch, source-derived key).
// Expecteds are derived from the inputs, NOT observed output.
describe.runIf(COVERAGE_ENABLED)('coverage collection — generic (monomorphized) branches', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, GENERICS);
  });

  test('clampGeneric if: arm hits sum across i32 + f64 -> [2,1]', () => {
    // i32: then(-5) + implicit-else(5); f64: then(-1) -> then 2, implicit else 1.
    expect(branchHitsByType(entry, 'if')[0]).toEqual([2, 1]);
  });

  test('pickGeneric ternary: arm hits sum across i32 + f64 -> [2,1]', () => {
    // i32: then(true) + else(false); f64: then(true) -> then 2, else 1.
    expect(branchHitsByType(entry, 'cond-expr')[0]).toEqual([2, 1]);
  });
});
