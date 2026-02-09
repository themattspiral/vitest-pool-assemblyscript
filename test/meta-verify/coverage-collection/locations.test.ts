import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR,
  loadCoverageResults, requireEntry,
  hitCount, coveredCount, totalFunctions, functionInfo,
} from './helpers.js';

const FUNCTION_LOCATIONS = `${COV_DIR}/function-locations.meta.ts`;
const FILE_BOUNDARY = `${COV_DIR}/file-boundary.meta.ts`;

describe('coverage collection — location accuracy', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- Function location accuracy ---
  // Source file layout (from function-locations.meta.ts):
  // Line 1: /** doc comment */
  // Line 3: export function atLineThree
  // Line 7: export class Located {
  // Line 8:   constructor() {}
  // Line 10:  method(): i32 {
  // Line 14:  get prop(): i32 {
  // Line 18:  static staticMethod(): i32 {

  describe('function-locations: fnMap line numbers match source', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, FUNCTION_LOCATIONS);
    });

    test('atLineThree starts at line 3', () => {
      const info = functionInfo(entry, 'atLineThree');
      expect(info).toBeDefined();
      expect(info!.line).toBe(3);
    });

    // Empty constructor body — same behavior as emptyVoid: no source location to map
    test('Located constructor not tracked (empty body)', () => {
      expect(functionInfo(entry, 'Located#constructor')).toBeUndefined();
    });

    test('Located method location', () => {
      const info = functionInfo(entry, 'Located#method');
      expect(info).toBeDefined();
      expect(info!.line).toBe(10);
    });

    test('Located prop getter location', () => {
      const info = functionInfo(entry, 'Located#get:prop');
      expect(info).toBeDefined();
      expect(info!.line).toBe(14);
    });

    test('Located staticMethod location', () => {
      const info = functionInfo(entry, 'Located.staticMethod');
      expect(info).toBeDefined();
      expect(info!.line).toBe(18);
    });
  });

  // --- File boundary functions ---

  describe('file-boundary: functions at start and end of file', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, FILE_BOUNDARY);
    });

    test('firstLine starts at line 1', () => {
      const info = functionInfo(entry, 'firstLine');
      expect(info).toBeDefined();
      expect(info!.line).toBe(1);
    });

    test('middleFunction tracked', () => {
      expect(hitCount(entry, 'middleFunction')).toBe(1);
    });

    test('lastLine tracked (no trailing newline)', () => {
      expect(hitCount(entry, 'lastLine')).toBe(1);
    });

    test('all 3 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(3);
    });

    test('all 3 covered', () => {
      expect(coveredCount(entry)).toBe(3);
    });
  });
});
