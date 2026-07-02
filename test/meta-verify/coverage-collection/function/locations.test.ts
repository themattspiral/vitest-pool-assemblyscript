import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage, functionInfo,
} from '../../helpers/shared.js';

const FUNCTION_LOCATIONS = `${COV_DIR}/function/function-locations.meta.ts`;
const FILE_BOUNDARY = `${COV_DIR}/function/file-boundary.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('function coverage — location accuracy', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // Source layout (function-locations.meta.ts):
  //   line 3  export function atLineThree
  //   line 7  export class Located {
  //   line 8    constructor() {}        ← empty body, no source location → untracked
  //   line 10   method(): i32
  //   line 14   get prop(): i32
  //   line 18   static staticMethod(): i32
  describe('function-locations: fnMap line numbers match source', () => {
    let entry: FileCoverage;
    beforeAll(() => { entry = requireEntry(coverageMap, FUNCTION_LOCATIONS); });

    // The empty constructor is excluded entirely (the exact name set below would fail
    // if it were tracked).
    test('all non-empty functions tracked and covered', () => {
      expectFunctionCoverage(entry, {
        atLineThree: 1,
        'Located#method': 1,
        'Located#get:prop': 1,
        'Located.staticMethod': 1,
      });
    });

    test('empty constructor has no fnMap entry (no source location)', () => {
      expect(functionInfo(entry, 'Located#constructor')).toBeUndefined();
    });

    test('fnMap lines match the source declarations', () => {
      expect(functionInfo(entry, 'atLineThree')?.line).toBe(3);
      expect(functionInfo(entry, 'Located#method')?.line).toBe(10);
      expect(functionInfo(entry, 'Located#get:prop')?.line).toBe(14);
      expect(functionInfo(entry, 'Located.staticMethod')?.line).toBe(18);
    });
  });

  describe('file-boundary: functions at the first and last line of a file', () => {
    let entry: FileCoverage;
    beforeAll(() => { entry = requireEntry(coverageMap, FILE_BOUNDARY); });

    test('all three boundary functions tracked and covered', () => {
      expectFunctionCoverage(entry, {
        firstLine: 1,
        middleFunction: 1,
        lastLine: 1,
      });
    });

    // firstLine opens on line 1; lastLine closes the file with no trailing newline.
    test('first function starts at line 1', () => {
      expect(functionInfo(entry, 'firstLine')?.line).toBe(1);
    });
  });
});
