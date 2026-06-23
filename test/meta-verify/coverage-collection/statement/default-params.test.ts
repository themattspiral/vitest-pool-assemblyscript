import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, hitCount, statementHitsByLine,
} from '../../helpers/shared.js';

// Regression guard: an inlined default-parameter `Const` must not pollute statement
// coverage. When a caller omits a defaulted argument (`addBase(n)`, `new Thing()`),
// the value is inlined at the parameter's DEFINITION site — on the signature line,
// which is never an AST statement position — so the range-bounded statement matcher
// ignores it. The single-line fixture forces the default onto the SAME source line as
// the body statement; the body must still read its real count, not the caller's.
//
// (Counts are single-binary, as the meta-verify suite runs one runtime. The cross-
// runtime skip/drift behavior these fixtures also exercise is covered elsewhere.)

const HELPER = `${COV_DIR}/statement/default-param-helper.meta.ts`;
const CONSUMER = `${COV_DIR}/statement/default-param-consumer.meta.ts`;
const SINGLE_LINE = `${COV_DIR}/statement/single-line-default.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — inlined default-param Const does not pollute statements', () => {
  let map: CoverageMap;
  beforeAll(async () => { map = (await loadCoverageResults()).coverageMap; });

  describe('function default (addBase) — `= 100` inlined at the signature site', () => {
    let helper: FileCoverage, consumer: FileCoverage;
    beforeAll(() => { helper = requireEntry(map, HELPER); consumer = requireEntry(map, CONSUMER); });

    test('addBase called 3x (2 defaulted via useAddBase + 1 explicit)', () => {
      expect(hitCount(helper, 'addBase')).toBe(3);
    });
    test('useAddBase called 2x', () => {
      expect(hitCount(consumer, 'useAddBase')).toBe(2);
    });
    // The inlined `= 100` lands on the signature line (5), not a statement; the body
    // `return n + base` (line 6) reads the real call count, unpolluted.
    test('addBase body `return n + base` (line 6) reads 3, not polluted', () => {
      expect(statementHitsByLine(helper, 6)).toEqual([3]);
    });
    test('useAddBase body `return addBase(n)` (line 6) reads 2', () => {
      expect(statementHitsByLine(consumer, 6)).toEqual([2]);
    });
  });

  describe('constructor default (Thing) in a folded if — `= 50` inlined at the signature site', () => {
    let helper: FileCoverage, consumer: FileCoverage;
    beforeAll(() => { helper = requireEntry(map, HELPER); consumer = requireEntry(map, CONSUMER); });

    test('Thing#constructor called 2x', () => {
      expect(hitCount(helper, 'Thing#constructor')).toBe(2);
    });
    test('makeThingFolded called 2x', () => {
      expect(hitCount(consumer, 'makeThingFolded')).toBe(2);
    });
    // The inlined `= 50` lands on the constructor signature line (11); the body
    // `this.v = start` (line 12) reads the real construction count, unpolluted.
    test('Thing#constructor body `this.v = start` (line 12) reads 2, not polluted', () => {
      expect(statementHitsByLine(helper, 12)).toEqual([2]);
    });
    test('makeThingFolded then-body reads 2 (lines 14, 15); unreachable `return -1` (line 17) reads 0', () => {
      expect(statementHitsByLine(consumer, 14)).toEqual([2]);
      expect(statementHitsByLine(consumer, 15)).toEqual([2]);
      expect(statementHitsByLine(consumer, 17)).toEqual([0]);
    });
  });

  describe('single-line default — default `= N` shares a line with the body statement', () => {
    let sl: FileCoverage;
    beforeAll(() => { sl = requireEntry(map, SINGLE_LINE); });

    // Each body runs 3x while the inlining block runs once, so pollution would make a
    // body read 1 instead of 3 — the discriminating case for the same-line edge.
    test('slAdd called 3x', () => {
      expect(hitCount(sl, 'slAdd')).toBe(3);
    });
    test('SLThing#constructor called 3x', () => {
      expect(hitCount(sl, 'SLThing#constructor')).toBe(3);
    });
    test('slAdd body `return n + base` (line 11) reads 3, not 1 (no pollution despite same line)', () => {
      expect(statementHitsByLine(sl, 11)).toEqual([3]);
    });
    test('SLThing ctor body `this.v = start` (line 13) reads 3, not 1 (no pollution despite same line)', () => {
      expect(statementHitsByLine(sl, 13)).toEqual([3]);
    });
  });
});
