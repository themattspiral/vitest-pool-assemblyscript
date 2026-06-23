import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, coveredCount, uncoveredCount, totalFunctions,
} from '../helpers/shared.js';

const MULTIPLE_CLASSES = `${COV_DIR}/multiple-classes.meta.ts`;

// Remaining structure case pending consolidation into the function/classes theme;
// the inline/generic/empty/trap cases moved to function/special-forms.test.ts.
describe.runIf(COVERAGE_ENABLED)('coverage collection — structure cases', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  describe('multiple-classes: independent tracking per class', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, MULTIPLE_CLASSES);
    });

    test('Dog constructor called 1 time', () => {
      expect(hitCount(entry, 'Dog#constructor')).toBe(1);
    });

    test('Dog bark called 1 time', () => {
      expect(hitCount(entry, 'Dog#bark')).toBe(1);
    });

    test('Dog name getter called 1 time', () => {
      expect(hitCount(entry, 'Dog#get:name')).toBe(1);
    });

    test('Dog fetch uncovered (0 hits)', () => {
      expect(hitCount(entry, 'Dog#fetch')).toBe(0);
    });

    test('Cat constructor called 1 time', () => {
      expect(hitCount(entry, 'Cat#constructor')).toBe(1);
    });

    test('Cat meow called 1 time', () => {
      expect(hitCount(entry, 'Cat#meow')).toBe(1);
    });

    test('Cat name getter called 1 time', () => {
      expect(hitCount(entry, 'Cat#get:name')).toBe(1);
    });

    test('Cat purr uncovered (0 hits)', () => {
      expect(hitCount(entry, 'Cat#purr')).toBe(0);
    });

    test('has 8 functions total (4 per class)', () => {
      expect(totalFunctions(entry)).toBe(8);
    });

    test('6 covered, 2 uncovered', () => {
      expect(coveredCount(entry)).toBe(6);
      expect(uncoveredCount(entry)).toBe(2);
    });
  });
});
