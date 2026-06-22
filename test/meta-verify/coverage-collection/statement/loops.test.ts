import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine,
} from '../../helpers/shared.js';

// AS fixture vs its line-aligned v8 twin (js-coverage-parity-src/statement/loops.ts).
// statementHitsByLine returns the hit counts of all statements starting on a line.
const AS = `${COV_DIR}/statement/loops.meta.ts`;
const JS = 'js-coverage-parity-src/statement/loops.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — loop statements (D11 entry-position)', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  // AS statement hit counts, derived from the known inputs in loops.meta.test.ts —
  // D11: a loop is *reached* once; its body runs N times. Read at the statement's
  // entry position, never max-over-range — NOT from observed output.
  describe('AS statement hits (entry-position, not max-over-range)', () => {
    test('forSum(4): init reached once, body 4x, return once', () => {
      expect(statementHitsByLine(as, 7)).toEqual([1]);    // let total = 0
      expect(statementHitsByLine(as, 8)).toEqual([1, 1]); // for-init reached once
      expect(statementHitsByLine(as, 9)).toEqual([4]);    // total += i — body 4x
      expect(statementHitsByLine(as, 11)).toEqual([1]);   // return total
    });

    test('whileCountdown(3): body 3x, return once', () => {
      expect(statementHitsByLine(as, 15)).toEqual([1]);   // let steps = 0
      expect(statementHitsByLine(as, 17)).toEqual([3]);   // n = n - 1 — body 3x
      expect(statementHitsByLine(as, 18)).toEqual([3]);   // steps = steps + 1
      expect(statementHitsByLine(as, 20)).toEqual([1]);   // return steps
    });

    test('doAtLeastOnce(2): body 2x', () => {
      expect(statementHitsByLine(as, 24)).toEqual([1]);   // let count = 0
      expect(statementHitsByLine(as, 26)).toEqual([2]);   // count = count + 1 — body 2x
      expect(statementHitsByLine(as, 27)).toEqual([2]);   // n = n - 1
      expect(statementHitsByLine(as, 29)).toEqual([1]);   // return count
    });

    test('nestedLoops(2,3): inner reached 2x, inner body 6x', () => {
      expect(statementHitsByLine(as, 33)).toEqual([1]);    // let cells = 0
      expect(statementHitsByLine(as, 34)).toEqual([1, 1]); // outer for-init reached once
      expect(statementHitsByLine(as, 35)).toEqual([2, 2]); // inner for reached 2x (per outer)
      expect(statementHitsByLine(as, 36)).toEqual([6]);    // cells = cells + 1 — 2*3
      expect(statementHitsByLine(as, 39)).toEqual([1]);    // return cells
    });

    test('neverLooped(0): body uncovered (0), function still covered', () => {
      expect(statementHitsByLine(as, 43)).toEqual([1]);    // let x = 0
      expect(statementHitsByLine(as, 44)).toEqual([1, 1]); // for-init reached once
      expect(statementHitsByLine(as, 45)).toEqual([0]);    // x = x + 100 — body never runs
      expect(statementHitsByLine(as, 47)).toEqual([1]);    // return x
    });
  });

  // Parity with the v8 oracle: identical inputs, line-aligned twin. Every statement
  // matches EXCEPT the `while` header — the one documented divergence below.
  describe('parity with v8 (line-aligned twin)', () => {
    const ALIGNED = [7, 8, 9, 11, 15, 17, 18, 20, 24, 25, 26, 27, 29, 33, 34, 35, 36, 39, 43, 44, 45, 47];

    test.each(ALIGNED)('line %i: AS statement hits == v8', (line) => {
      expect(statementHitsByLine(as, line)).toEqual(statementHitsByLine(js, line));
    });

    // DOCUMENTED DIVERGENCE (fidelity contract — exact counts are best-effort where
    // CFG lowering diverges from source structure). `while (n > 0)`: we are a CFG /
    // compiled-output tool, so the while's entry position is its CONDITION block,
    // re-evaluated N+1 times (4 for n=3). v8 instruments source and counts the
    // while STATEMENT as reached once. Covered/uncovered (the hard requirement)
    // agrees — both > 0; only the exact ×N count differs.
    test('while header (L16): AS counts condition evals (N+1=4); v8 counts the statement once', () => {
      expect(statementHitsByLine(as, 16)).toEqual([4]);
      expect(statementHitsByLine(js, 16)).toEqual([1]);
      expect(statementHitsByLine(as, 16)[0]).toBeGreaterThan(0); // covered in both
      expect(statementHitsByLine(js, 16)[0]).toBeGreaterThan(0);
    });
  });
});
