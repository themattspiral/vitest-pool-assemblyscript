import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, allFunctionNames, totalFunctions,
} from './helpers.js';

const TOP_LEVEL_CODE = `${COV_DIR}/top-level-code.meta.ts`;
const NAMESPACE_FUNCTIONS = `${COV_DIR}/namespace-functions.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — module-level features', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- Top-level executable code ---

  describe('top-level-code: module-scope code outside functions', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, TOP_LEVEL_CODE);
    });

    test('helper function covered', () => {
      const hits = hitCount(entry, 'helper');
      expect(hits).toBeDefined();
      expect(hits!).toBeGreaterThan(0);
    });

    test('readComputed function covered', () => {
      expect(hitCount(entry, 'readComputed')).toBe(1);
    });
  });

  // --- Namespace functions ---

  describe('namespace-functions: namespace function discovery and naming', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, NAMESPACE_FUNCTIONS);
    });

    test('square covered', () => {
      const hits = hitCount(entry, 'square') ?? hitCount(entry, 'MathUtils.square');
      expect(hits).toBeDefined();
      expect(hits!).toBe(1);
    });

    test('cube covered', () => {
      const hits = hitCount(entry, 'cube') ?? hitCount(entry, 'MathUtils.cube');
      expect(hits).toBeDefined();
      expect(hits!).toBe(1);
    });

    test('unused is uncovered (0 hits)', () => {
      const hits = hitCount(entry, 'unused') ?? hitCount(entry, 'MathUtils.unused');
      expect(hits).toBeDefined();
      expect(hits!).toBe(0);
    });

    test('topLevel covered', () => {
      expect(hitCount(entry, 'topLevel')).toBe(1);
    });

    test('has expected number of functions (3 namespace + 1 top-level)', () => {
      expect(totalFunctions(entry)).toBe(4);
    });

    test('discovered function names', () => {
      const names = allFunctionNames(entry);
      expect(names.length).toBeGreaterThan(0);
    });
  });
});
