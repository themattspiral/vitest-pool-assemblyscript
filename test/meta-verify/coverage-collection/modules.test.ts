import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, allFunctionNames, coveredCount, uncoveredCount, totalFunctions,
} from '../helpers/shared.js';

const TOP_LEVEL_CODE = `${COV_DIR}/top-level-code.meta.ts`;
const NAMESPACE_FUNCTIONS = `${COV_DIR}/namespace-functions.meta.ts`;
const NAMESPACE_CLASSES = `${COV_DIR}/namespace-classes.meta.ts`;

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

    test('helper called 19 times (top-level initializations + direct call across instances)', () => {
      expect(hitCount(entry, 'helper')).toBe(19);
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

  // Namespace functions use namespace-prefixed names (e.g. 'MathUtils.square')
  // to match the binary naming convention and avoid ambiguity between namespaces.
  describe('namespace-functions: namespace function discovery and naming', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, NAMESPACE_FUNCTIONS);
    });

    test('MathUtils.square called 1 time', () => {
      expect(hitCount(entry, 'MathUtils.square')).toBe(1);
    });

    test('MathUtils.cube called 1 time', () => {
      expect(hitCount(entry, 'MathUtils.cube')).toBe(1);
    });

    test('MathUtils.unused is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'MathUtils.unused')).toBe(0);
    });

    test('topLevel called 1 time', () => {
      expect(hitCount(entry, 'topLevel')).toBe(1);
    });

    test('has exactly 4 functions (3 namespace + 1 top-level)', () => {
      expect(totalFunctions(entry)).toBe(4);
    });

    test('uses namespace-prefixed function names', () => {
      const names = allFunctionNames(entry);
      expect(names).toHaveLength(4);
      expect(names).toContain('MathUtils.square');
      expect(names).toContain('MathUtils.cube');
      expect(names).toContain('MathUtils.unused');
      expect(names).toContain('topLevel');
    });

    test('3 covered, 1 uncovered', () => {
      expect(coveredCount(entry)).toBe(3);
      expect(uncoveredCount(entry)).toBe(1);
    });
  });

  // Namespace classes with identical structure must be tracked independently.
  // Each namespace's class gets its own coverage entries with namespace-prefixed names.
  // This guards against coverage misattribution where instrumentation indices for
  // later namespace classes exceed the coverage memory extraction bounds.
  describe('namespace-classes: independent tracking per namespace', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, NAMESPACE_CLASSES);
    });

    test('Animals.Dog#constructor called 2 times', () => {
      expect(hitCount(entry, 'Animals.Dog#constructor')).toBe(2);
    });

    test('Animals.Dog#speak called 1 time', () => {
      expect(hitCount(entry, 'Animals.Dog#speak')).toBe(1);
    });

    test('Robots.Dog#constructor called 2 times', () => {
      expect(hitCount(entry, 'Robots.Dog#constructor')).toBe(2);
    });

    test('Robots.Dog#speak called 1 time', () => {
      expect(hitCount(entry, 'Robots.Dog#speak')).toBe(1);
    });

    test('has exactly 4 functions (2 per namespace class)', () => {
      expect(totalFunctions(entry)).toBe(4);
    });

    test('all 4 covered', () => {
      expect(coveredCount(entry)).toBe(4);
      expect(uncoveredCount(entry)).toBe(0);
    });
  });
});
