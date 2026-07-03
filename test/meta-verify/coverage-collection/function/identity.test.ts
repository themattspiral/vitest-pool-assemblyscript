import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage, toForwardSlash,
} from '../../helpers/shared.js';

const COLLISION_A = `${COV_DIR}/function/name-collision-a.meta.ts`;
const COLLISION_B = `${COV_DIR}/function/name-collision-b.meta.ts`;
const MAIN_HELPERS = `${COV_DIR}/function/math-helpers.meta.ts`;
const EDGE_HELPERS = `${COV_DIR}/function/edge/math-helpers.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('function coverage — identity (same names across files/dirs)', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // Two files each define a function named `calculate`; the entries must stay
  // distinct (no cross-file name collision in the fnMap).
  describe('same function name in different files', () => {
    let a: FileCoverage;
    let b: FileCoverage;
    beforeAll(() => {
      a = requireEntry(coverageMap, COLLISION_A);
      b = requireEntry(coverageMap, COLLISION_B);
    });

    test('files A and B are distinct coverage objects', () => {
      expect(a.path).not.toBe(b.path);
    });

    test('file A tracks calculate + onlyInA', () => {
      expectFunctionCoverage(a, { calculate: 1, onlyInA: 1 });
    });

    test('file B tracks calculate + onlyInB', () => {
      expectFunctionCoverage(b, { calculate: 1, onlyInB: 1 });
    });
  });

  // Two files share the basename math-helpers.meta.ts in different directories; they
  // must resolve to distinct coverage entries keyed by their full path.
  describe('same filename in different directories', () => {
    let main: FileCoverage;
    let edge: FileCoverage;
    beforeAll(() => {
      main = requireEntry(coverageMap, MAIN_HELPERS);
      edge = requireEntry(coverageMap, EDGE_HELPERS);
    });

    test('main and edge math-helpers are distinct entries', () => {
      expect(main.path).not.toBe(edge.path);
      // paths are OS-native in the report (backslash on Windows); normalize for the
      // slash-agnostic structural check.
      expect(toForwardSlash(main.path)).toContain('/function/math-helpers.meta.ts');
      expect(toForwardSlash(edge.path)).toContain('/function/edge/math-helpers.meta.ts');
    });

    test('main file tracks add + mainOnly', () => {
      expectFunctionCoverage(main, { add: 1, mainOnly: 1 });
    });

    test('edge file tracks add + edgeOnly', () => {
      expectFunctionCoverage(edge, { add: 1, edgeOnly: 1 });
    });
  });
});
