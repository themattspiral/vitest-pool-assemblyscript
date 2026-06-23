import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, allFunctionNames, coveredCount, uncoveredCount, totalFunctions,
} from '../helpers/shared.js';

const CLASS_MIXED = `${COV_DIR}/class-with-mixed-usage.meta.ts`;
const CLASS_UNUSED = `${COV_DIR}/class-utils-unused.meta.ts`;

// Remaining class cases pending consolidation into the function/classes theme; the
// math-helpers / call-counting / standalone-unused cases moved to
// function/counting.test.ts.
describe.runIf(COVERAGE_ENABLED)('coverage collection — basic scenarios', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  describe('class-with-mixed-usage: class partial coverage', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, CLASS_MIXED);
    });

    test('constructor called 1 time', () => {
      expect(hitCount(entry, 'MixedCounter#constructor')).toBe(1);
    });

    test('increment called 3 times', () => {
      expect(hitCount(entry, 'MixedCounter#increment')).toBe(3);
    });

    test('value getter called 1 time', () => {
      expect(hitCount(entry, 'MixedCounter#get:value')).toBe(1);
    });

    test('decrement is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'MixedCounter#decrement')).toBe(0);
    });

    test('reset is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'MixedCounter#reset')).toBe(0);
    });

    test('static create is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'MixedCounter.create')).toBe(0);
    });

    test('exactly these 6 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(6);
      expect(allFunctionNames(entry)).toEqual(
        expect.arrayContaining([
          'MixedCounter#constructor', 'MixedCounter#increment', 'MixedCounter#decrement',
          'MixedCounter#reset', 'MixedCounter#get:value', 'MixedCounter.create',
        ]),
      );
    });

    test('3 covered, 3 uncovered', () => {
      expect(coveredCount(entry)).toBe(3);
      expect(uncoveredCount(entry)).toBe(3);
    });
  });

  describe('class-utils-unused: completely unused class file', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, CLASS_UNUSED);
    });

    test('all class methods have 0 hits', () => {
      expect(hitCount(entry, 'UnusedCounter#constructor')).toBe(0);
      expect(hitCount(entry, 'UnusedCounter#increment')).toBe(0);
      expect(hitCount(entry, 'UnusedCounter#get:count')).toBe(0);
      expect(hitCount(entry, 'UnusedCounter#set:count')).toBe(0);
      expect(hitCount(entry, 'UnusedCounter.createDefault')).toBe(0);
      expect(hitCount(entry, 'UnusedCounter#tripleCount')).toBe(0);
      expect(hitCount(entry, 'UnusedCounter#getTripled')).toBe(0);
    });

    test('exactly these 7 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(7);
      expect(allFunctionNames(entry)).toEqual(
        expect.arrayContaining([
          'UnusedCounter#constructor', 'UnusedCounter#increment',
          'UnusedCounter#get:count', 'UnusedCounter#set:count',
          'UnusedCounter.createDefault', 'UnusedCounter#tripleCount', 'UnusedCounter#getTripled',
        ]),
      );
    });

    test('0 covered, 7 uncovered', () => {
      expect(coveredCount(entry)).toBe(0);
      expect(uncoveredCount(entry)).toBe(7);
    });
  });
});
