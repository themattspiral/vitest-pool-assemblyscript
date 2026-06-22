import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine, uncoveredLineNumbers, hitCount,
} from '../../helpers/shared.js';

// zerohit.meta.ts / zerohit.ts are NOT imported by any test — they appear in coverage
// only because they match the include globs. The provider parses the AST to report
// them all-uncovered (v8 does the same for never-loaded included files).
const AS = `${COV_DIR}/statement/zerohit.meta.ts`;
const JS = 'js-coverage-parity-src/statement/zerohit.ts';
const STATEMENT_LINES = [7, 8, 12, 13, 15];

describe.runIf(COVERAGE_ENABLED)('coverage collection — never-imported source (0-hit reporting)', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  // The source of truth for "what should be covered" is the AST, so every statement
  // is present (and uncovered) without any binary ever running.
  describe('AS reports the uncovered source from the AST alone', () => {
    test('every statement present and uncovered', () => {
      for (const ln of STATEMENT_LINES) {
        expect(statementHitsByLine(as, ln)).toEqual([0]);
      }
      expect(uncoveredLineNumbers(as)).toEqual(STATEMENT_LINES);
    });

    test('functions present and uncovered', () => {
      expect(hitCount(as, 'untestedAdd')).toBe(0);
      expect(hitCount(as, 'untestedBranch')).toBe(0);
    });
  });

  // v8 (via vitest's include) reports never-loaded files too — same all-uncovered shape.
  describe('parity with v8 (both report never-loaded included files)', () => {
    test('v8 reports the same statements all-uncovered', () => {
      for (const ln of STATEMENT_LINES) {
        expect(statementHitsByLine(js, ln)).toEqual(statementHitsByLine(as, ln));
      }
      expect(uncoveredLineNumbers(js)).toEqual(uncoveredLineNumbers(as));
    });
  });
});
