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
});
