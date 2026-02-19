import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, coveredCount, uncoveredCount, totalFunctions,
} from '../helpers/shared.js';

const MATH_HELPERS = `${COV_DIR}/math-helpers.meta.ts`;
const CLASS_MIXED = `${COV_DIR}/class-with-mixed-usage.meta.ts`;
const CALL_COUNTING = `${COV_DIR}/call-counting.meta.ts`;
const STANDALONE_UNUSED = `${COV_DIR}/standalone-unused.meta.ts`;
const CLASS_UNUSED = `${COV_DIR}/class-utils-unused.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — basic scenarios', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- 1. Partial function coverage (math-helpers) ---

  describe('math-helpers: partial function coverage', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, MATH_HELPERS);
    });

    test('add called 3 times', () => {
      expect(hitCount(entry, 'add')).toBe(3);
    });

    test('subtract called 1 time', () => {
      expect(hitCount(entry, 'subtract')).toBe(1);
    });

    test('multiply called 2 times', () => {
      expect(hitCount(entry, 'multiply')).toBe(2);
    });

    test('divide is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'divide')).toBe(0);
    });

    test('negate is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'negate')).toBe(0);
    });

    test('has exactly 5 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(5);
    });

    test('3 covered, 2 uncovered', () => {
      expect(coveredCount(entry)).toBe(3);
      expect(uncoveredCount(entry)).toBe(2);
    });
  });

  // --- 2. Class partial coverage ---

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

    test('has exactly 6 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(6);
    });

    test('3 covered, 3 uncovered', () => {
      expect(coveredCount(entry)).toBe(3);
      expect(uncoveredCount(entry)).toBe(3);
    });
  });

  // --- 3. Precise hit counts ---

  describe('call-counting: precise hit counts', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, CALL_COUNTING);
    });

    test('calledOnce has exactly 1 hit', () => {
      expect(hitCount(entry, 'calledOnce')).toBe(1);
    });

    test('calledThrice has exactly 3 hits', () => {
      expect(hitCount(entry, 'calledThrice')).toBe(3);
    });

    test('calledFiveTimes has exactly 5 hits', () => {
      expect(hitCount(entry, 'calledFiveTimes')).toBe(5);
    });

    test('neverCalled is uncovered (0 hits)', () => {
      expect(hitCount(entry, 'neverCalled')).toBe(0);
    });

    test('has exactly 4 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(4);
    });

    test('3 covered, 1 uncovered', () => {
      expect(coveredCount(entry)).toBe(3);
      expect(uncoveredCount(entry)).toBe(1);
    });
  });

  // --- 4. Completely unused standalone file ---

  describe('standalone-unused: completely unused file', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, STANDALONE_UNUSED);
    });

    test('all functions have 0 hits', () => {
      expect(hitCount(entry, 'unusedHelperA')).toBe(0);
      expect(hitCount(entry, 'unusedHelperB')).toBe(0);
      expect(hitCount(entry, 'unusedHelperC')).toBe(0);
    });

    test('has exactly 3 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(3);
    });

    test('0 covered, 3 uncovered', () => {
      expect(coveredCount(entry)).toBe(0);
      expect(uncoveredCount(entry)).toBe(3);
    });
  });

  // --- 5. Completely unused class file (pre-existing fixture) ---

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

    test('has exactly 7 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(7);
    });

    test('0 covered, 7 uncovered', () => {
      expect(coveredCount(entry)).toBe(0);
      expect(uncoveredCount(entry)).toBe(7);
    });
  });
});
