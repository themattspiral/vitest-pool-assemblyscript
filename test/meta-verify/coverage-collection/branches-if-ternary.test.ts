import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
} from '../helpers/shared.js';

const IF_TERNARY = `${COV_DIR}/branch-if-ternary.meta.ts`;

// Per-arm branch hit counts for branch-if-ternary.meta.ts, derived from the inputs
// in branch-if-ternary.meta.test.ts and v8 branch semantics (located arms counted
// directly; an if-without-else's implicit else = decisionHits − then) — NOT from
// observed output.
describe.runIf(COVERAGE_ENABLED)('coverage collection — if / ternary branches', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, IF_TERNARY);
  });

  // 'if' branches by source position:
  //   [0] absVal  [1] clampLow  [2] classify-outer  [3] classify-inner
  //   [4] clampRange-outer  [5] clampRange-inner
  describe('if / else / else-if', () => {
    test('absVal if/else: then 2, else 1', () => {
      expect(branchHitsByType(entry, 'if')[0]).toEqual([2, 1]);
    });

    test('clampLow if-without-else: then 1, implicit else 1 (derived)', () => {
      expect(branchHitsByType(entry, 'if')[1]).toEqual([1, 1]);
    });

    test('classify else-if chain: outer [1,2], inner [1,1]', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[2]).toEqual([1, 2]); // outer (n<0 / rest)
      expect(ifs[3]).toEqual([1, 1]); // inner (n==0 / n>0)
    });

    test('clampRange nested if: outer [2,1], inner [1,1] (both implicit elses derived)', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[4]).toEqual([2, 1]); // outer (n>0 / implicit else)
      expect(ifs[5]).toEqual([1, 1]); // inner (n>100 / implicit else)
    });
  });

  // 'cond-expr' branches by source position:
  //   [0] pickFirst  [1] orDefault  [2] sign-outer  [3] sign-inner
  describe('ternary (cond-expr)', () => {
    test('pickFirst ternary: both arms [1,1]', () => {
      expect(branchHitsByType(entry, 'cond-expr')[0]).toEqual([1, 1]);
    });

    test('orDefault ternary: else-only [0,2]', () => {
      expect(branchHitsByType(entry, 'cond-expr')[1]).toEqual([0, 2]);
    });

    test('sign nested ternary: outer [1,2], inner [1,1]', () => {
      const conds = branchHitsByType(entry, 'cond-expr');
      expect(conds[2]).toEqual([1, 2]); // outer (n>0 ? 1 : …)
      expect(conds[3]).toEqual([1, 1]); // inner (n<0 ? -1 : 0)
    });
  });
});
