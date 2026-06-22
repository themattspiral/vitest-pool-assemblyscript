import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine, lineHits, uncoveredLineNumbers,
} from '../../helpers/shared.js';

// AS fixture vs its line-aligned v8 twin (js-coverage-parity-src/statement/layout.ts).
const AS = `${COV_DIR}/statement/layout.meta.ts`;
const JS = 'js-coverage-parity-src/statement/layout.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — statement layout & line coverage', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  // AS statement hits, derived from the inputs in layout.meta.test.ts.
  describe('AS statement hits (layout)', () => {
    test('multi-line statement: hit lands on the entry line; arg lines are not statements', () => {
      expect(statementHitsByLine(as, 7)).toEqual([1]);  // let sum = add( ... ) — entry line
      expect(statementHitsByLine(as, 8)).toEqual([]);   // arg `a` — not a statement
      expect(statementHitsByLine(as, 9)).toEqual([]);   // arg `b` — not a statement
      expect(statementHitsByLine(as, 11)).toEqual([1]); // return sum
    });

    test('multiple statements on one line: each counted independently', () => {
      expect(statementHitsByLine(as, 19)).toEqual([1, 1]); // let x = n; let y = n + 1;
    });

    test('two-declarator Variable on one line: each declarator counted', () => {
      expect(statementHitsByLine(as, 20)).toEqual([1, 1]); // let a = 1, b = 2;
    });

    test('unusedPath never called: body statements uncovered', () => {
      expect(statementHitsByLine(as, 25)).toEqual([0]); // let doubled = n * 2
      expect(statementHitsByLine(as, 26)).toEqual([0]); // return doubled
    });
  });

  // Derived line coverage (max hit count among statements starting on the line).
  describe('AS line coverage (derived)', () => {
    test('covered lines read 1; packed/declarator lines collapse the two statements to 1', () => {
      expect(lineHits(as, 7)).toBe(1);
      expect(lineHits(as, 19)).toBe(1);
      expect(lineHits(as, 20)).toBe(1);
      expect(lineHits(as, 25)).toBe(0);
    });

    test('uncovered-line set = the unusedPath body', () => {
      expect(uncoveredLineNumbers(as)).toEqual([25, 26]);
    });
  });

  // Full parity with the v8 oracle — statement hits and the uncovered-line set.
  describe('parity with v8 (line-aligned twin)', () => {
    const ALIGNED = [7, 8, 9, 11, 15, 19, 20, 21, 25, 26];
    test.each(ALIGNED)('line %i: AS statement hits == v8', (line) => {
      expect(statementHitsByLine(as, line)).toEqual(statementHitsByLine(js, line));
    });

    test('uncovered-line set matches v8', () => {
      expect(uncoveredLineNumbers(as)).toEqual(uncoveredLineNumbers(js));
    });
  });
});
