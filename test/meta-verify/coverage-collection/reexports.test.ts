import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, totalFunctions,
} from './helpers.js';

const REEXPORT_ORIGINAL = `${COV_DIR}/reexport-original.meta.ts`;
const REEXPORT_BARREL = `${COV_DIR}/reexport-barrel.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — re-exports', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- Original source file ---

  describe('reexport-original: original source file coverage', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, REEXPORT_ORIGINAL);
    });

    test('originalFunc covered (called via barrel re-export)', () => {
      expect(hitCount(entry, 'originalFunc')).toBe(1);
    });

    test('notReexported is uncovered (never imported by any test)', () => {
      expect(hitCount(entry, 'notReexported')).toBe(0);
    });

    test('has exactly 2 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(2);
    });
  });

  // --- Barrel file ---

  describe('reexport-barrel: barrel file coverage', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, REEXPORT_BARREL);
    });

    test('barrelOwn covered', () => {
      expect(hitCount(entry, 'barrelOwn')).toBe(1);
    });

    test('barrel file tracks only its own functions (not re-exported ones)', () => {
      expect(totalFunctions(entry)).toBe(1);
    });
  });
});
