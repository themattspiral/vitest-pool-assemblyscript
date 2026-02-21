import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, allFunctionNames, coveredCount, uncoveredCount, totalFunctions,
} from '../helpers/shared.js';

const TOP_LEVEL_CODE = `${COV_DIR}/top-level-code.meta.ts`;
const NAMESPACE_FUNCTIONS = `${COV_DIR}/namespace-functions.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — module-level features', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // helper() is called many times: 2 top-level initializations (COMPUTED, DOUBLE_COMPUTED)
  // plus 1 direct call in the test, and additional calls from the test file's module-level
  // imports triggering multiple WASM instantiations across the test suite.
  describe('top-level-code: module-scope code outside functions', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, TOP_LEVEL_CODE);
    });

    test('helper called 15 times (top-level initializations + direct call across instances)', () => {
      expect(hitCount(entry, 'helper')).toBe(15);
    });

    test('readComputed called 1 time', () => {
      expect(hitCount(entry, 'readComputed')).toBe(1);
    });

    test('has exactly 2 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(2);
    });

    test('all functions covered', () => {
      expect(coveredCount(entry)).toBe(2);
      expect(uncoveredCount(entry)).toBe(0);
    });
  });

  // Namespace functions use bare names (e.g. 'square', not 'MathUtils.square').
  // The namespace prefix is stripped during instrumentation — only the function
  // name itself appears in fnMap.
  describe('namespace-functions: namespace function discovery and naming', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, NAMESPACE_FUNCTIONS);
    });

    test('square called 1 time', () => {
      expect(hitCount(entry, 'square')).toBe(1);
    });

    test('cube called 1 time', () => {
      expect(hitCount(entry, 'cube')).toBe(1);
    });

    test('unused is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'unused')).toBe(0);
    });

    test('topLevel called 1 time', () => {
      expect(hitCount(entry, 'topLevel')).toBe(1);
    });

    test('has exactly 4 functions (3 namespace + 1 top-level)', () => {
      expect(totalFunctions(entry)).toBe(4);
    });

    test('uses bare function names (not namespace-prefixed)', () => {
      const names = allFunctionNames(entry);
      expect(names).toHaveLength(4);
      expect(names).toContain('square');
      expect(names).toContain('cube');
      expect(names).toContain('unused');
      expect(names).toContain('topLevel');
    });

    test('3 covered, 1 uncovered', () => {
      expect(coveredCount(entry)).toBe(3);
      expect(uncoveredCount(entry)).toBe(1);
    });
  });
});
