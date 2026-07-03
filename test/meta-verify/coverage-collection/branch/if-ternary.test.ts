import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
  hitCount, totalFunctions, allFunctionNames,
} from '../../helpers/shared.js';

const IF_TERNARY = `${COV_DIR}/branch/if-ternary.meta.ts`;
const JS_IF_TERNARY = 'js-coverage-parity-src/branch/if-ternary.ts';

// Per-arm branch hit counts for branch/if-ternary.meta.ts, derived from the inputs
// in branch/if-ternary.meta.test.ts and v8 branch semantics (located arms counted
// directly; an if-without-else's implicit else = decisionHits − then) — NOT from
// observed output.
describe.runIf(COVERAGE_ENABLED)('coverage collection — if / ternary branches', () => {
  let entry: FileCoverage;
  let jsEntry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, IF_TERNARY);
    jsEntry = requireEntry(coverageMap, JS_IF_TERNARY);
  });

  // 'if' branches by source position:
  //   [0] absVal  [1] clampLow  [2] classify-outer  [3] classify-inner
  //   [4] clampRange-outer  [5] clampRange-inner  [6] gateThenOnly  [7] guardElseOnly
  //   [8] gateAfterStmts  [9] countBelowThreshold  [10] gateAfterStmtsWithElse
  describe('if / else / else-if', () => {
    test('absVal if/else: then 2, else 1', () => {
      expect(branchHitsByType(entry, 'if')[0]).toEqual([2, 1]);
    });

    test('clampLow if-without-else: then 1, implicit else 1 (derived)', () => {
      expect(branchHitsByType(entry, 'if')[1]).toEqual([1, 1]);
    });

    test('classify else-if chain: outer [1,2], inner [1,1]', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[2]).toEqual([1, 2]); // outer (n<0 / rest)
      expect(ifs[3]).toEqual([1, 1]); // inner (n==0 / n>0)
    });

    test('clampRange nested if: outer [2,1], inner [1,1] (both implicit elses derived)', () => {
      const ifs = branchHitsByType(entry, 'if');
      expect(ifs[4]).toEqual([2, 1]); // outer (n>0 / implicit else)
      expect(ifs[5]).toEqual([1, 1]); // inner (n>100 / implicit else)
    });

    test('gateThenOnly: untested explicit else reads 0 -> [2,0]', () => {
      expect(branchHitsByType(entry, 'if')[6]).toEqual([2, 0]);
    });

    test('guardElseOnly: untested then, derived implicit else -> [0,2]', () => {
      expect(branchHitsByType(entry, 'if')[7]).toEqual([0, 2]);
    });

    // Statement-preceded ifs (issue #37 regression): straight-line statements share
    // the condition's basic block, so the decision position must come from the
    // block's LAST located expression. When broken, the branch is misclassified as
    // compiler-folded and the taken implicit else reads 0 — [1,0] and [2,0] below.
    test('gateAfterStmts: statement-preceded if-without-else -> [1,1]', () => {
      expect(branchHitsByType(entry, 'if')[8]).toEqual([1, 1]);
    });

    test('countBelowThreshold: statement-preceded if in loop body -> [2,2]', () => {
      expect(branchHitsByType(entry, 'if')[9]).toEqual([2, 2]);
    });

    test('gateAfterStmtsWithElse: statement-preceded if/else -> [1,1]', () => {
      expect(branchHitsByType(entry, 'if')[10]).toEqual([1, 1]);
    });
  });

  // 'cond-expr' branches by source position:
  //   [0] pickFirst  [1] orDefault  [2] sign-outer  [3] sign-inner
  describe('ternary (cond-expr)', () => {
    test('pickFirst ternary: both arms [1,1]', () => {
      expect(branchHitsByType(entry, 'cond-expr')[0]).toEqual([1, 1]);
    });

    test('orDefault ternary: else-only [0,2]', () => {
      expect(branchHitsByType(entry, 'cond-expr')[1]).toEqual([0, 2]);
    });

    test('sign nested ternary: outer [1,2], inner [1,1]', () => {
      const conds = branchHitsByType(entry, 'cond-expr');
      expect(conds[2]).toEqual([1, 2]); // outer (n>0 ? 1 : …)
      expect(conds[3]).toEqual([1, 1]); // inner (n<0 ? -1 : 0)
    });
  });

  // v8-twin parity: js-coverage-parity-src/branch/if-ternary.ts mirrors this fixture
  // construct-for-construct with identical inputs. if/ternary branch coverage matches
  // v8 EXACTLY — including if-without-else, where v8 (like AS) emits the implicit-else
  // arm (contrast switch's default-less arm, which v8 omits).
  describe('v8-twin parity', () => {
    test('if arms match v8 exactly', () => {
      expect(branchHitsByType(entry, 'if')).toEqual(branchHitsByType(jsEntry, 'if'));
    });

    test('cond-expr (ternary) arms match v8 exactly', () => {
      expect(branchHitsByType(entry, 'cond-expr')).toEqual(branchHitsByType(jsEntry, 'cond-expr'));
    });

    test('function coverage matches v8 exactly', () => {
      expect(totalFunctions(entry)).toBe(totalFunctions(jsEntry));
      for (const name of allFunctionNames(jsEntry)) {
        expect(hitCount(entry, name), `fn ${name}`).toBe(hitCount(jsEntry, name));
      }
    });
  });
});
