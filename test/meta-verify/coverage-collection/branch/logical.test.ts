import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
} from '../../helpers/shared.js';

const LOGICAL = `${COV_DIR}/branch/logical.meta.ts`;

// Per-arm branch hit counts for branch/logical.meta.ts, derived from the inputs in
// branch/logical.meta.test.ts and v8's per-evaluation logical semantics (the left
// operand is counted every evaluation; the right only when the left's value forces
// it — `&&` left-true, `||` left-false) — NOT from observed output.
describe.runIf(COVERAGE_ENABLED)('coverage collection — logical branches', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, LOGICAL);
  });

  // binary-expr branches by source position (line → start col → range end):
  //   [0] andCheck &&        [1] orCheck ||         [2] ifAnd &&
  //   [3] ifOr ||            [4] andChain inner a&&b [5] andChain outer (a&&b)&&c
  describe('logical operators (binary-expr): left always, right iff evaluated', () => {
    test('andCheck &&: left 2, right 1 (one short-circuit)', () => {
      const bins = branchHitsByType(entry, 'binary-expr');
      expect(bins[0]).toEqual([2, 1]);
    });

    test('orCheck ||: left 2, right 1 (one short-circuit)', () => {
      const bins = branchHitsByType(entry, 'binary-expr');
      expect(bins[1]).toEqual([2, 1]);
    });

    test('andChain nested &&: inner [3,2], outer [3,1]', () => {
      const bins = branchHitsByType(entry, 'binary-expr');
      expect(bins[4]).toEqual([3, 2]); // inner a && b
      expect(bins[5]).toEqual([3, 1]); // outer (a && b) && c
    });
  });

  // Fused-logical: the `if`'s decision block is unlocated (its condition is the
  // synthetic logical result), so its hits derive from the leftmost atom. ifAnd
  // has no else (implicit else derived = decisionHits − then); ifOr has an explicit
  // else (both arms located, counted directly).
  describe('fused-logical if conditions', () => {
    test('ifAnd (if (a && b), no else): then 1, implicit else 2', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[0]).toEqual([1, 2]);
    });

    test('ifAnd && operand arms: left 3, right 2', () => {
      const bins = branchHitsByType(entry, 'binary-expr');
      expect(bins[2]).toEqual([3, 2]);
    });

    test('ifOr (if (a || b), explicit else): then 2, else 1', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[1]).toEqual([2, 1]);
    });

    test('ifOr || operand arms: left 3, right 2', () => {
      const bins = branchHitsByType(entry, 'binary-expr');
      expect(bins[3]).toEqual([3, 2]);
    });
  });
});
