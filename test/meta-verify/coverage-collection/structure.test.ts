import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR,
  loadCoverageResults, requireEntry,
  hitCount, coveredCount, uncoveredCount, totalFunctions,
} from './helpers.js';

const INLINE_FUNCTIONS = `${COV_DIR}/inline-functions.meta.ts`;
const GENERIC_FUNCTIONS = `${COV_DIR}/generic-functions.meta.ts`;
const MULTIPLE_CLASSES = `${COV_DIR}/multiple-classes.meta.ts`;
const EMPTY_FUNCTIONS = `${COV_DIR}/empty-functions.meta.ts`;
const TRAP_COVERAGE = `${COV_DIR}/trap-coverage.meta.ts`;

describe('coverage collection — structure cases', () => {
  let coverageMap: CoverageMap;

  beforeAll(() => {
    const results = loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- 8. @inline function coverage ---

  describe('inline-functions: @inline decorator coverage', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, INLINE_FUNCTIONS);
    });

    test('inlinedAdd has hits (direct call + inlined call)', () => {
      expect(hitCount(entry, 'inlinedAdd')).toBe(2);
    });

    test('normalAdd called 1 time', () => {
      expect(hitCount(entry, 'normalAdd')).toBe(1);
    });

    test('callsInlined called 1 time', () => {
      expect(hitCount(entry, 'callsInlined')).toBe(1);
    });

    test('has exactly 3 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(3);
    });

    test('all 3 covered', () => {
      expect(coveredCount(entry)).toBe(3);
    });
  });

  // --- 9. Generic function coverage ---

  describe('generic-functions: monomorphized variant summing', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, GENERIC_FUNCTIONS);
    });

    test('identity called 3 times (i32 + f64 + string monomorphizations summed)', () => {
      expect(hitCount(entry, 'identity')).toBe(3);
    });

    test('isNull called 2 times (non-null + null)', () => {
      expect(hitCount(entry, 'isNull')).toBe(2);
    });

    test('nonGeneric called 1 time', () => {
      expect(hitCount(entry, 'nonGeneric')).toBe(1);
    });

    test('has exactly 3 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(3);
    });

    test('all 3 covered', () => {
      expect(coveredCount(entry)).toBe(3);
    });
  });

  // --- 10. Multiple classes in one file ---

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

  // --- 11. Empty and minimal functions ---

  describe('empty-functions: empty and minimal bodies tracked', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, EMPTY_FUNCTIONS);
    });

    // emptyVoid() has no function body — compiles to a Nop with no source location.
    // The native instrumentation skips it because there is no representative location
    // to map back to source. This is expected: there is no executable source content.
    test('emptyVoid is not tracked (no source location for empty body)', () => {
      expect(hitCount(entry, 'emptyVoid')).toBeUndefined();
    });

    test('returnsZero called 1 time', () => {
      expect(hitCount(entry, 'returnsZero')).toBe(1);
    });

    test('nonEmpty called 1 time', () => {
      expect(hitCount(entry, 'nonEmpty')).toBe(1);
    });

    test('has exactly 2 functions tracked (emptyVoid excluded)', () => {
      expect(totalFunctions(entry)).toBe(2);
    });

    test('both tracked functions covered', () => {
      expect(coveredCount(entry)).toBe(2);
    });
  });

  // --- 12. Trap/abort entry counting ---

  describe('trap-coverage: functions that trap still counted', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, TRAP_COVERAGE);
    });

    test('calledBeforeTrap called 1 time', () => {
      expect(hitCount(entry, 'calledBeforeTrap')).toBe(1);
    });

    test('willTrap has hits despite aborting (entry counting)', () => {
      expect(hitCount(entry, 'willTrap')).toBe(1);
    });

    test('has exactly 2 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(2);
    });

    test('both covered', () => {
      expect(coveredCount(entry)).toBe(2);
    });
  });
});
