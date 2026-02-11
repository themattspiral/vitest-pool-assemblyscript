import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, allFunctionNames,
} from './helpers.js';

const CLASS_INHERITANCE = `${COV_DIR}/class-inheritance.meta.ts`;
const OPERATOR_OVERLOAD = `${COV_DIR}/operator-overload.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — inheritance & operator overloads', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- Class inheritance ---

  describe('class-inheritance: inherited and overridden method tracking', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, CLASS_INHERITANCE);
    });

    test('Animal constructor covered (called via super() from Dog and Cat)', () => {
      expect(hitCount(entry, 'Animal#constructor')).toBe(7);
    });

    test('Animal speak covered (called via Dog and Cat)', () => {
      expect(hitCount(entry, 'Animal#speak')).toBe(2);
    });

    test('Animal move covered once (Cat inherits, Dog overrides)', () => {
      expect(hitCount(entry, 'Animal#move')).toBe(1);
    });

    test('Animal name getter covered', () => {
      expect(hitCount(entry, 'Animal#get:name')).toBe(1);
    });

    test('Dog constructor covered', () => {
      expect(hitCount(entry, 'Dog#constructor')).toBe(4);
    });

    test('Dog move covered (overrides Animal.move)', () => {
      expect(hitCount(entry, 'Dog#move')).toBe(1);
    });

    test('Dog bark covered', () => {
      expect(hitCount(entry, 'Dog#bark')).toBe(1);
    });

    test('Cat constructor covered', () => {
      expect(hitCount(entry, 'Cat#constructor')).toBe(3);
    });

    test('Cat meow covered', () => {
      expect(hitCount(entry, 'Cat#meow')).toBe(1);
    });

    test('function names use ClassName#method convention', () => {
      const names = allFunctionNames(entry);
      expect(names).toContain('Animal#constructor');
      expect(names).toContain('Dog#constructor');
      expect(names).toContain('Cat#constructor');
    });
  });

  // --- Operator overloads ---

  describe('operator-overload: @operator decorated methods', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, OPERATOR_OVERLOAD);
    });

    test('Vec2 constructor covered', () => {
      expect(hitCount(entry, 'Vec2#constructor')).toBe(6);
    });

    test('@operator("+") add appears in coverage and is covered', () => {
      expect(hitCount(entry, 'Vec2.add')).toBe(1);
    });

    test('@operator("==") equals appears in coverage and is covered', () => {
      expect(hitCount(entry, 'Vec2.equals')).toBe(1);
    });

    test('regular method length covered', () => {
      expect(hitCount(entry, 'Vec2#length')).toBe(1);
    });

    test('operator overload functions tracked with expected names', () => {
      const names = allFunctionNames(entry);
      expect(names).toContain('Vec2.add');
      expect(names).toContain('Vec2.equals');
    });
  });
});
