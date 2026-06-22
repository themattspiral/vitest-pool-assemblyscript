import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine,
} from '../../helpers/shared.js';

// AS fixture vs its line-aligned v8 twin (js-coverage-parity-src/statement/kinds.ts).
const AS = `${COV_DIR}/statement/kinds.meta.ts`;
const JS = 'js-coverage-parity-src/statement/kinds.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — statement kinds', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  // AS statement hits, derived from the inputs in kinds.meta.test.ts — confirms each
  // coverable statement kind is matched & counted.
  describe('AS statement hits (each coverable kind matched & counted)', () => {
    test('multi-declarator Variable: each declarator counted independently', () => {
      expect(statementHitsByLine(as, 9)).toEqual([1, 1, 1]); // let a = 1, b = 2, c = 3
      expect(statementHitsByLine(as, 10)).toEqual([1]);      // return a + b + c
    });

    test('ExpressionStatement: assign / increment / call (+ void helper body)', () => {
      expect(statementHitsByLine(as, 14)).toEqual([1]); // let x = n
      expect(statementHitsByLine(as, 15)).toEqual([1]); // x = x + 1   (assignment)
      expect(statementHitsByLine(as, 16)).toEqual([1]); // x++         (increment)
      expect(statementHitsByLine(as, 17)).toEqual([1]); // touch(x)    (call)
      expect(statementHitsByLine(as, 18)).toEqual([1]); // return x
      expect(statementHitsByLine(as, 22)).toEqual([1]); // sink = v    (void helper body)
    });

    test('Continue and Break: both extracted and counted', () => {
      expect(statementHitsByLine(as, 26)).toEqual([1]); // let total = 0
      expect(statementHitsByLine(as, 28)).toEqual([4]); // if (i==1) — checked each of 4 iters
      expect(statementHitsByLine(as, 29)).toEqual([1]); // continue (i==1, once)
      expect(statementHitsByLine(as, 31)).toEqual([3]); // if (i==3) — skipped after the continue
      expect(statementHitsByLine(as, 32)).toEqual([1]); // break (i==3, once)
      expect(statementHitsByLine(as, 34)).toEqual([2]); // total = total + i (i=0, i=2)
      expect(statementHitsByLine(as, 36)).toEqual([1]); // return total
    });

    test('Throw: extracted, uncovered on the untaken path', () => {
      expect(statementHitsByLine(as, 40)).toEqual([1]); // if (n < 0)
      expect(statementHitsByLine(as, 41)).toEqual([0]); // throw — not taken (n=5)
      expect(statementHitsByLine(as, 43)).toEqual([1]); // return n
    });
  });

  // DOCUMENTED DIVERGENCE — module-level const-initialized Variable. A module-level
  // `let sink = 0` is initialized via the WASM global's init expression (a constant),
  // so AS emits no runtime block to count → reads 0. v8 instruments source and counts
  // the declaration once. (A *function-local* `let x = 0` IS counted — a runtime
  // assignment, see the loops/reachability themes — so this is specific to module
  // scope.) Measurement-model "erased → blind" category; unlike the count divergences
  // this one affects covered/uncovered.
  describe('module-level const-init Variable (erased in AS)', () => {
    test('let sink = 0 (L6): AS 0 (WASM global init expr, no block), v8 1', () => {
      expect(statementHitsByLine(as, 6)).toEqual([0]);
      expect(statementHitsByLine(js, 6)).toEqual([1]);
    });
  });

  // Parity on every in-function statement (the L6 module global is the one divergence).
  describe('parity with v8 (line-aligned twin)', () => {
    const ALIGNED = [9, 10, 14, 15, 16, 17, 18, 22, 26, 27, 28, 29, 31, 32, 34, 36, 40, 41, 43];
    test.each(ALIGNED)('line %i: AS statement hits == v8', (line) => {
      expect(statementHitsByLine(as, line)).toEqual(statementHitsByLine(js, line));
    });
  });
});
