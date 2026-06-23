import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine,
} from '../../helpers/shared.js';

// AS fixture vs its line-aligned v8 twin (js-coverage-parity-src/statement/generics.ts).
const AS = `${COV_DIR}/statement/generics.meta.ts`;
const JS = 'js-coverage-parity-src/statement/generics.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — generic (monomorphized) statements', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  // clamp<T> is compiled as two functions (i32, f64) but attributed to clamp's single
  // source, so each statement's hits SUM across instances — derived from inputs.
  describe('AS statement hits SUM across monomorphizations', () => {
    test('clamp body: each instance runs once, summed at the single source', () => {
      expect(statementHitsByLine(as, 7)).toEqual([2]);  // if (v < lo): i32 + f64
      expect(statementHitsByLine(as, 8)).toEqual([0]);  // return lo: neither < lo
      expect(statementHitsByLine(as, 10)).toEqual([2]); // if (v > hi): i32 + f64
      expect(statementHitsByLine(as, 11)).toEqual([1]); // return hi: f64 only (15 > 10)
      expect(statementHitsByLine(as, 13)).toEqual([1]); // return v: i32 only (5 in range)
    });

    test('callers each run once', () => {
      expect(statementHitsByLine(as, 17)).toEqual([1]); // useI32 → clamp<i32>
      expect(statementHitsByLine(as, 21)).toEqual([1]); // useF64 → clamp<f64>
    });
  });

  // Parity: v8's one-function-called-twice equals AS's SUM of two monomorphizations.
  describe('parity with v8 (one function called twice == SUM of two monomorphizations)', () => {
    const ALIGNED = [7, 8, 10, 11, 13, 17, 21];
    test.each(ALIGNED)('line %i: AS statement hits == v8', (line) => {
      expect(statementHitsByLine(as, line)).toEqual(statementHitsByLine(js, line));
    });
  });
});
