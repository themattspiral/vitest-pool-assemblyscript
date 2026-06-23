import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine, uncoveredLineNumbers, hitCount,
} from '../../helpers/shared.js';

// zerohit.meta.ts is NOT imported by any test — it appears in coverage only because it
// matches the include globs, and the provider parses the AST to report it all-uncovered.
//
// AS-only theme (no JS twin): v8 reports never-imported files too, but only IN-ROOT — it
// finds never-loaded files by globbing `coverage.include` from cwd=root, which cannot
// reach a file outside the project root (the external `../` case; an *imported* twin is
// fine because it's loaded). So there is no external v8-parity for a never-imported file
// without copying it in-root. The AS provider has no such restriction (it parses the
// included sources directly), so the AS-side feature is what we verify here.
const AS = `${COV_DIR}/statement/zerohit.meta.ts`;
const STATEMENT_LINES = [7, 8, 12, 13, 15];

describe.runIf(COVERAGE_ENABLED)('coverage collection — never-imported source (0-hit reporting)', () => {
  let as: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
  });

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
});
