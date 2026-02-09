import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR,
  loadCoverageResults, requireEntry,
  hitCount, coveredCount, totalFunctions,
} from './helpers.js';

const MATH_HELPERS = `${COV_DIR}/math-helpers.meta.ts`;
const EDGE_COLLISION_A = `${COV_DIR}/edge/name-collision-a.meta.ts`;
const EDGE_COLLISION_B = `${COV_DIR}/edge/name-collision-b.meta.ts`;
const EDGE_MATH_HELPERS = `${COV_DIR}/edge/math-helpers.meta.ts`;

describe('coverage collection — edge cases', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- 6. Same-named functions in different files ---

  describe('edge: same-named functions in different files', () => {
    let entryA: FileCoverage;
    let entryB: FileCoverage;

    beforeAll(() => {
      entryA = requireEntry(coverageMap, EDGE_COLLISION_A);
      entryB = requireEntry(coverageMap, EDGE_COLLISION_B);
    });

    test('entries are distinct coverage objects', () => {
      expect(entryA.path).not.toBe(entryB.path);
    });

    test('calculate in file A called 1 time', () => {
      expect(hitCount(entryA, 'calculate')).toBe(1);
    });

    test('calculate in file B called 1 time', () => {
      expect(hitCount(entryB, 'calculate')).toBe(1);
    });

    test('onlyInA called 1 time', () => {
      expect(hitCount(entryA, 'onlyInA')).toBe(1);
    });

    test('onlyInB called 1 time', () => {
      expect(hitCount(entryB, 'onlyInB')).toBe(1);
    });

    test('file A has 2 functions, all covered', () => {
      expect(totalFunctions(entryA)).toBe(2);
      expect(coveredCount(entryA)).toBe(2);
    });

    test('file B has 2 functions, all covered', () => {
      expect(totalFunctions(entryB)).toBe(2);
      expect(coveredCount(entryB)).toBe(2);
    });
  });

  // --- 7. Same-named file in different directory ---

  describe('edge: same-named file in different directory', () => {
    let mainEntry: FileCoverage;
    let edgeEntry: FileCoverage;

    beforeAll(() => {
      mainEntry = requireEntry(coverageMap, MATH_HELPERS);
      edgeEntry = requireEntry(coverageMap, EDGE_MATH_HELPERS);
    });

    test('entries are distinct (different paths)', () => {
      expect(mainEntry.path).not.toBe(edgeEntry.path);
      expect(mainEntry.path).toContain('/math-helpers.meta.ts');
      expect(edgeEntry.path).toContain('/edge/math-helpers.meta.ts');
    });

    test('add in main file called 3 times (from basic test)', () => {
      expect(hitCount(mainEntry, 'add')).toBe(3);
    });

    test('add in edge file called 1 time (from edge test)', () => {
      expect(hitCount(edgeEntry, 'add')).toBe(1);
    });

    test('edgeOnly called 1 time', () => {
      expect(hitCount(edgeEntry, 'edgeOnly')).toBe(1);
    });

    test('edge file has 2 functions, all covered', () => {
      expect(totalFunctions(edgeEntry)).toBe(2);
      expect(coveredCount(edgeEntry)).toBe(2);
    });
  });
});
