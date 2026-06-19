import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
} from '../helpers/shared.js';

const BRANCH = `${COV_DIR}/branch-coverage.meta.ts`;

// Per-arm branch hit counts for branch-coverage.meta.ts, derived from the inputs
// in branch-coverage.meta.test.ts and v8's "entered" branch semantics (NOT from
// observed output). The empty fall-through switch (dayType) is the primary guard:
// an entered empty case reports its true count, an untested empty case reports 0
// (the bug it replaced reported untested empty cases as covered).
describe.runIf(COVERAGE_ENABLED)('coverage collection — branch coverage', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, BRANCH);
  });

  describe('switch branches (ordered by source line: dayType, then category)', () => {
    test('dayType empty fall-through: entered empty case counted, untested empty case = 0', () => {
      // arms in source order: case0(empty), case6(body), case1(empty), case2(body), default.
      // inputs 0, 2, 9:
      //   case0 = 1  (day 0 matches the empty case)
      //   case6 = 1  (day 0 falls through into the shared body; day 6 untested)
      //   case1 = 0  (never entered — the empty case that must NOT pick up an adjacent hit)
      //   case2 = 1  (day 2 matches the body case)
      //   default = 1 (day 9)
      const [dayTypeSwitch] = branchHitsByType(entry, 'switch');
      expect(dayTypeSwitch).toEqual([1, 1, 0, 1, 1]);
    });

    test('category clean switch: untested body case = 0', () => {
      // arms: case1, case2, default. inputs 1, 99: case1 = 1, case2 = 0, default = 1.
      const switches = branchHitsByType(entry, 'switch');
      expect(switches[1]).toEqual([1, 0, 1]);
    });
  });

  describe('if / ternary branches', () => {
    test('clampLow if-without-else: implicit else derived as 0 when never taken', () => {
      // input -3: then taken once; implicit else (n >= 0) never taken.
      const [ifBranch] = branchHitsByType(entry, 'if');
      expect(ifBranch).toEqual([1, 0]);
    });

    test('pickFirst ternary: untested else arm = 0', () => {
      // input true: then arm once; else arm never.
      const [ternary] = branchHitsByType(entry, 'cond-expr');
      expect(ternary).toEqual([1, 0]);
    });
  });

  // Compile-time-constant conditions are folded away by AS (no decision block), but
  // v8 still reports the branch with constant-determined coverage. Expected values
  // are v8's: live arm covered, eliminated arm 0; logical left always covered, right
  // covered iff the constant left evaluates it.
  describe('folded (constant-condition) branches', () => {
    test('foldedIf (if(true)): then covered, eliminated else 0', () => {
      // 'if' branches by line: clampLow (real), then foldedIf.
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[1]).toEqual([1, 0]);
    });

    test('foldedTernary (true ? 10 : 20): const/const arms collapse → accepted [0,0] gap', () => {
      // KNOWN, ACCEPTED LIMITATION: a folded ternary whose BOTH arms are
      // compile-time constants (`cond ? const : const`) collapses to a single
      // result Const at the construct start, so neither arm range catches a hit —
      // it reads [0,0] instead of v8's [1,0]. A folded ternary with ANY
      // non-constant arm (`cond ? x+1 : x+2`, calls, …) works: the live arm's code
      // survives at its own source position. This degenerate const/const case is
      // documented and accepted (the compiler erases it — the CFG/compiled-output
      // model is inherently blind to it), not fixed. 'cond-expr' branches by line:
      // pickFirst (real) is conds[0], foldedTernary is conds[1].
      const conds = branchHitsByType(entry, 'cond-expr');
      expect(conds[1]).toEqual([0, 0]);
    });

    test('foldedAndEval (true && x>0): left + evaluated right both covered', () => {
      // left constant-true → right (x>0) evaluated → [1,1] (v8 parity).
      const [andEval] = branchHitsByType(entry, 'binary-expr');
      expect(andEval).toEqual([1, 1]);
    });

    test('foldedAndShort (false && x>0): right short-circuited → 0', () => {
      // left constant-false → right not evaluated → [1,0].
      const bins = branchHitsByType(entry, 'binary-expr');
      expect(bins[1]).toEqual([1, 0]);
    });
  });
});
