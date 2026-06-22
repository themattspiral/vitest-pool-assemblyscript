import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine,
} from '../../helpers/shared.js';

// AS fixture vs its line-aligned v8 twin (js-coverage-parity-src/statement/reachability.ts).
const AS = `${COV_DIR}/statement/reachability.meta.ts`;
const JS = 'js-coverage-parity-src/statement/reachability.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — reachability statements', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  // AS statement hits, derived from the inputs in reachability.meta.test.ts — NOT
  // from observed output.
  describe('AS statement hits', () => {
    test('classify: both arms covered; trailing Unreachable does not clobber the else (D5 MAX)', () => {
      expect(statementHitsByLine(as, 8)).toEqual([2]);  // if reached 2x (both calls)
      expect(statementHitsByLine(as, 9)).toEqual([1]);  // then: return 1 (classify(5))
      expect(statementHitsByLine(as, 11)).toEqual([1]); // else: return -1 (classify(-5))
    });

    test('earlyReturn(5): uncovered early-return body (0) beside covered post-if (matching-miss differentiator)', () => {
      expect(statementHitsByLine(as, 16)).toEqual([1]); // if reached once
      expect(statementHitsByLine(as, 17)).toEqual([0]); // early return NOT taken (n=5 → n<0 false)
      expect(statementHitsByLine(as, 19)).toEqual([1]); // post-if: let doubled — executed
      expect(statementHitsByLine(as, 20)).toEqual([1]); // return doubled
    });

    test('guarded(true): conditional body covered', () => {
      expect(statementHitsByLine(as, 24)).toEqual([1]); // let result = 0
      expect(statementHitsByLine(as, 25)).toEqual([1]); // if reached once
      expect(statementHitsByLine(as, 26)).toEqual([1]); // result = 10 (flag true)
      expect(statementHitsByLine(as, 28)).toEqual([1]); // return result
    });
  });

  // Full parity with the v8 oracle — every statement matches (no lossy-lowering
  // divergence for straight-line / branch-body statements).
  describe('parity with v8 (line-aligned twin)', () => {
    const ALIGNED = [8, 9, 11, 16, 17, 19, 20, 24, 25, 26, 28];
    test.each(ALIGNED)('line %i: AS statement hits == v8', (line) => {
      expect(statementHitsByLine(as, line)).toEqual(statementHitsByLine(js, line));
    });
  });
});
