import { describe, test, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { runVitest } from '../../scripts/run-vitest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

const EXTERNAL_DIR_NAME = 'vitest-pool-assemblyscript-test-external';
const EXTERNAL_DIR = resolve(PROJECT_ROOT, '..', EXTERNAL_DIR_NAME);

const isExternalContext = process.env.RUN_CONTEXT === 'external';
const isExternalNoCoverageContext = process.env.RUN_CONTEXT === 'external_no_coverage';

// --- Coverage data types ---

interface FunctionInfo {
  name: string;
  decl: { start: { line: number; column: number }; end: { line: number; column: number } };
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  line: number;
}

interface FileCoverage {
  path: string;
  fnMap: Record<string, FunctionInfo>;
  f: Record<string, number>;
  statementMap: Record<string, unknown>;
  s: Record<string, number>;
  branchMap: Record<string, unknown>;
  b: Record<string, number>;
}

type CoverageMap = Record<string, FileCoverage>;

// --- Source file path suffixes for coverage lookup ---

const COV_DIR = 'coverage-collection-meta';
const MATH_HELPERS = `${COV_DIR}/math-helpers.meta.ts`;
const CLASS_MIXED = `${COV_DIR}/class-with-mixed-usage.meta.ts`;
const CALL_COUNTING = `${COV_DIR}/call-counting.meta.ts`;
const STANDALONE_UNUSED = `${COV_DIR}/standalone-unused.meta.ts`;
const CLASS_UNUSED = `${COV_DIR}/class-utils-unused.meta.ts`;
const EDGE_COLLISION_A = `${COV_DIR}/edge/name-collision-a.meta.ts`;
const EDGE_COLLISION_B = `${COV_DIR}/edge/name-collision-b.meta.ts`;
const EDGE_MATH_HELPERS = `${COV_DIR}/edge/math-helpers.meta.ts`;

// --- Helpers ---

/**
 * Find a coverage entry by matching the end of its absolute path key.
 * Returns null if no match found.
 */
function findEntry(map: CoverageMap, pathSuffix: string): FileCoverage | null {
  const key = Object.keys(map).find(k => k.endsWith(pathSuffix));
  return key ? map[key] : null;
}

/**
 * Find a coverage entry, throwing a descriptive error if not found.
 */
function requireEntry(map: CoverageMap, pathSuffix: string): FileCoverage {
  const entry = findEntry(map, pathSuffix);
  if (!entry) {
    const available = Object.keys(map)
      .filter(k => k.includes(COV_DIR))
      .map(k => `  - ${k}`)
      .join('\n');
    throw new Error(
      `No coverage entry found ending with "${pathSuffix}".\n` +
      `Available coverage-collection-meta entries:\n${available}`
    );
  }
  return entry;
}

/**
 * Get the hit count for a named function in a coverage entry.
 * Returns undefined if the function is not in fnMap.
 */
function hitCount(entry: FileCoverage, funcName: string): number | undefined {
  const idx = Object.entries(entry.fnMap).find(([_, fn]) => fn.name === funcName)?.[0];
  return idx !== undefined ? entry.f[idx] : undefined;
}

/**
 * Get all function names in a coverage entry.
 */
function allFunctionNames(entry: FileCoverage): string[] {
  return Object.values(entry.fnMap).map(fn => fn.name);
}

/**
 * Count how many functions have > 0 hits.
 */
function coveredCount(entry: FileCoverage): number {
  return Object.values(entry.f).filter(count => count > 0).length;
}

/**
 * Count how many functions have 0 hits.
 */
function uncoveredCount(entry: FileCoverage): number {
  return Object.values(entry.f).filter(count => count === 0).length;
}

/**
 * Total number of functions in the coverage entry.
 */
function totalFunctions(entry: FileCoverage): number {
  return Object.keys(entry.fnMap).length;
}

// --- Tests ---

describe('coverage collection verification', () => {
  let coverageMap: CoverageMap;

  beforeAll(() => {
    const cwd = isExternalContext || isExternalNoCoverageContext ? EXTERNAL_DIR : PROJECT_ROOT;

    const args = ['-c', 'vitest.meta.config.ts'];
    if (isExternalNoCoverageContext) {
      args.push('--coverage.enabled=false');
    }

    const start = performance.now();
    runVitest({ cwd, args, capture: true });
    console.log(`Coverage verification: meta suite completed in ${(performance.now() - start).toFixed(0)}ms`);

    if (!isExternalNoCoverageContext) {
      const coveragePath = resolve(cwd, 'coverage/meta-suite/coverage-final.json');
      expect(existsSync(coveragePath), 'coverage-final.json should exist').toBe(true);
      coverageMap = JSON.parse(readFileSync(coveragePath, 'utf-8'));
    }
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

  // --- 8. Coverage entry completeness ---

  describe('coverage-collection-meta files are all present', () => {
    test('all 8 source files have coverage entries', () => {
      const allSuffixes = [
        MATH_HELPERS, CLASS_MIXED, CALL_COUNTING, STANDALONE_UNUSED,
        CLASS_UNUSED, EDGE_COLLISION_A, EDGE_COLLISION_B, EDGE_MATH_HELPERS,
      ];

      for (const suffix of allSuffixes) {
        expect(findEntry(coverageMap, suffix), `missing entry: ${suffix}`).not.toBeNull();
      }
    });
  });
});
