import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
} from '../../helpers/shared.js';

const FOLDED = `${COV_DIR}/branch/folded.meta.ts`;

// Per-arm branch hit counts for branch/folded.meta.ts. Compile-time-constant
// conditions are folded away (no decision block), but v8 still reports the branch
// with constant-determined coverage: the live arm covered, the eliminated arm 0;
// for folded logicals, the left always covered and the right covered iff the
// constant left evaluates it. Expecteds are v8's, NOT observed output. Two
// degenerate const/const cases diverge from v8 and are asserted at our accepted
// value with the divergence noted.
describe.runIf(COVERAGE_ENABLED)('coverage collection — folded (constant-condition) branches', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, FOLDED);
  });

  // 'if' branches by source position:
  //   [0] foldedIfTrue  [1] foldedIfFalse  [2] foldedNested-outer
  //   [3] foldedNested-inner  [4] foldedNamedConst  [5] foldedCompare
  //   [6] foldedFusedAndConst
  describe('folded if (decision-presence detection)', () => {
    test('if(true): then live, else eliminated -> [1,0]', () => {
      expect(branchHitsByType(entry, 'if')[0]).toEqual([1, 0]);
    });

    test('if(false): then eliminated, else live -> [0,1]', () => {
      expect(branchHitsByType(entry, 'if')[1]).toEqual([0, 1]);
    });

    test('nested if(true){ if(true) }: outer [1,0], inner [1,0]', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[2]).toEqual([1, 0]); // outer
      expect(ifs[3]).toEqual([1, 0]); // inner
    });

    test('non-literal folds (named const, comparison, fused const): all [1,0]', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[4]).toEqual([1, 0]); // if(FLAG)
      expect(ifs[5]).toEqual([1, 0]); // if(1 < 2)
      expect(ifs[6]).toEqual([1, 0]); // if(true && true)
    });
  });

  // 'cond-expr' branches by source position: [0] foldedTernaryConst, [1] foldedTernaryLive
  describe('folded ternary', () => {
    test('true ? 10 : 20 (const/const): accepted [0,0] gap', () => {
      // KNOWN, ACCEPTED LIMITATION: both arms are compile-time constants, so the
      // ternary collapses to a single result const at the construct start and
      // neither arm range catches a hit — reads [0,0] instead of v8's [1,0]. The
      // compiler erases the distinction (CFG/compiled-output model is blind to it).
      expect(branchHitsByType(entry, 'cond-expr')[0]).toEqual([0, 0]);
    });

    test('true ? x+1 : x+2 (non-const arms): live arm survives -> [1,0]', () => {
      expect(branchHitsByType(entry, 'cond-expr')[1]).toEqual([1, 0]);
    });
  });

  // 'binary-expr' branches by source position:
  //   [0] foldedFusedAndConst's (true && true)  [1] foldedAndEval  [2] foldedAndShort
  //   [3] foldedOrShort  [4] foldedOrEval
  describe('folded logicals (binary-expr)', () => {
    test('true && true (const/const): accepted [1,0] (v8 [1,1])', () => {
      // ACCEPTED degenerate case: with a constant left AND right, the right folds
      // into the result const, so we read right=0 -> [1,0]; v8 reports [1,1]. Only
      // both-constant logicals diverge; left-const/right-real (below) match v8.
      expect(branchHitsByType(entry, 'binary-expr')[0]).toEqual([1, 0]);
    });

    test('true && x>0: left true -> right evaluated -> [1,1]', () => {
      expect(branchHitsByType(entry, 'binary-expr')[1]).toEqual([1, 1]);
    });

    test('false && x>0: left false -> right short-circuited -> [1,0]', () => {
      expect(branchHitsByType(entry, 'binary-expr')[2]).toEqual([1, 0]);
    });

    test('true || x>0: left true -> right short-circuited -> [1,0]', () => {
      expect(branchHitsByType(entry, 'binary-expr')[3]).toEqual([1, 0]);
    });

    test('false || x>0: left false -> right evaluated -> [1,1]', () => {
      expect(branchHitsByType(entry, 'binary-expr')[4]).toEqual([1, 1]);
    });
  });
});
