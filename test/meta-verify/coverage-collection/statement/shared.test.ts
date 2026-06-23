import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine,
} from '../../helpers/shared.js';

// shared.meta.ts is imported by shared-a (pick(true)) and shared-b (pick(false)),
// compiled into two binaries; statement hits accumulate by file+position. The
// v8 twin accumulates the same way across the two importing JS files.
const AS = `${COV_DIR}/statement/shared.meta.ts`;
const JS = 'js-coverage-parity-src/statement/shared.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — cross-file shared statements', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  // Self-validating: if cross-binary accumulation failed, one arm would read 0. The
  // shared statements sum to 2; each arm accrues 1 from its own binary.
  describe('AS statement hits accumulate across both binaries', () => {
    test('shared statements = 2; then/else arms = 1 each (from different binaries)', () => {
      expect(statementHitsByLine(as, 7)).toEqual([2]);  // let result = 0 — both files
      expect(statementHitsByLine(as, 8)).toEqual([2]);  // if (flag) — both files
      expect(statementHitsByLine(as, 9)).toEqual([1]);  // result = 1 — file A (then) only
      expect(statementHitsByLine(as, 11)).toEqual([1]); // result = 2 — file B (else) only
      expect(statementHitsByLine(as, 13)).toEqual([2]); // return result — both files
    });
  });

  describe('parity with v8 (accumulation across two importing files)', () => {
    const ALIGNED = [7, 8, 9, 11, 13];
    test.each(ALIGNED)('line %i: AS statement hits == v8', (line) => {
      expect(statementHitsByLine(as, line)).toEqual(statementHitsByLine(js, line));
    });
  });
});
