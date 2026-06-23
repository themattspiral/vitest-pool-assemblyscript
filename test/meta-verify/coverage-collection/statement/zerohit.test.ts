import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine, uncoveredLineNumbers, hitCount,
} from '../../helpers/shared.js';

// zerohit.meta.ts is NOT imported by any test — it appears in coverage only because it
// matches the include globs, and the provider parses the AST to report it all-uncovered.
//
// AS-only theme (no JS twin). A never-imported file would only get v8 coverage after v8's
// uncovered-file path TRANSFORMS it (stripping TS) and then parses it. v8 transforms an
// uncovered file through a project's vite server, which can only transform files inside its
// own root — so externally, where this twin would live in the main repo (../, outside the
// external project's root), the transform is never attempted: vitest's transformer skips
// every project whose root isn't a prefix of the path, v8 falls back to the raw TypeScript
// bytes, and its JS AST parser can't parse the `: number` annotations, so the file is
// dropped. (`allowExternal` does not help — it only relaxes the reporting filter, never the
// transformer.) The AS provider parses included sources with its own parser (no vite
// transform), so it reports the never-imported source as 0% local AND external — that AS
// feature is what we verify here.
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
