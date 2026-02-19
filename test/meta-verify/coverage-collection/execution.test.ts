import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry,
  hitCount, coveredCount, uncoveredCount, totalFunctions,
} from '../helpers/shared.js';

const TIMEOUT_COV = `${COV_DIR}/timeout-coverage.meta.ts`;
const RETRY_COV = `${COV_DIR}/retry-coverage.meta.ts`;
const FAILS_COV = `${COV_DIR}/fails-coverage.meta.ts`;
const SKIP_COV = `${COV_DIR}/skip-coverage.meta.ts`;
const CROSS_FILE_COV = `${COV_DIR}/cross-file-coverage.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — test execution scenarios', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    const results = await loadCoverageResults();
    coverageMap = results.coverageMap;
  });

  // --- Timeout coverage preservation ---
  //
  // Coverage is preserved across timeout resume via the "always merge" strategy:
  // the suite-level merge runs for every task (including completed ones) on resume,
  // re-populating coverage from individual task metas. This means explicit coverage
  // restoration is not needed — completed test/suite task objects retain their own
  // meta.coverageData, which gets re-merged into the parent suite.
  //
  // The test file uses a nested suite structure to verify:
  //   - Completed sibling suite coverage preserved (merged into parent before timeout)
  //   - Completed tests in the same suite as the timeout
  //   - Nested subsuites before and after the timeout

  describe('timeout-coverage: coverage preserved across timeout resume', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, TIMEOUT_COV);
    });

    // Completed sibling suite — coverage merged into parent before timeout
    test('completedSiblingFunc called 1 time (sibling suite completed before timeout)', () => {
      expect(hitCount(entry, 'completedSiblingFunc')).toBe(1);
    });

    // Nested subsuite that completed before the timeout test
    test('nestedBeforeFunc called 1 time (nested subsuite completed before timeout)', () => {
      expect(hitCount(entry, 'nestedBeforeFunc')).toBe(1);
    });

    // Test in the same suite as the timeout, before it
    test('beforeTimeout called 1 time (same suite, before timeout)', () => {
      expect(hitCount(entry, 'beforeTimeout')).toBe(1);
    });

    // Coverage lost — thread killed before coverage memory read
    test('duringTimeout has 0 hits (lost when thread killed)', () => {
      expect(hitCount(entry, 'duringTimeout')).toBe(0);
    });

    // Test in the same suite as the timeout, after resume
    test('afterTimeout called 1 time (same suite, after resume)', () => {
      expect(hitCount(entry, 'afterTimeout')).toBe(1);
    });

    // Nested subsuite that runs after timeout resume
    test('nestedAfterFunc called 1 time (nested subsuite after resume)', () => {
      expect(hitCount(entry, 'nestedAfterFunc')).toBe(1);
    });

    test('has exactly 6 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(6);
    });

    test('5 covered, 1 uncovered', () => {
      expect(coveredCount(entry)).toBe(5);
      expect(uncoveredCount(entry)).toBe(1);
    });
  });

  // --- Retried test coverage ---
  //
  // Current behavior: only the last retry attempt's coverage is kept.
  // resetTestForRetry() deletes meta.coverageData before each attempt,
  // and executeWASMTest() replaces it with the current attempt's data.
  // The suite-level merge happens once after all retries complete.
  //
  // TODO: Compare this to vitest JS pool retry coverage behavior and
  // make sure we mimic it. If vitest accumulates coverage across retry
  // attempts, we should do the same.

  describe('retry-coverage: only last attempt coverage is kept', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, RETRY_COV);
    });

    test('retryTarget has 1 hit (last attempt only, not accumulated)', () => {
      expect(hitCount(entry, 'retryTarget')).toBe(1);
    });

    test('retryHelper has 1 hit (last attempt only, not accumulated)', () => {
      expect(hitCount(entry, 'retryHelper')).toBe(1);
    });

    test('has exactly 2 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(2);
    });

    test('all functions covered', () => {
      expect(coveredCount(entry)).toBe(2);
      expect(uncoveredCount(entry)).toBe(0);
    });
  });

  // --- Fails test coverage collection ---

  describe('fails-coverage: expected-failure tests still collect coverage', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, FAILS_COV);
    });

    test('failsTarget has 1 hit (called in expected-failure test)', () => {
      expect(hitCount(entry, 'failsTarget')).toBe(1);
    });

    test('failsUncovered has 0 hits (not called by any test)', () => {
      expect(hitCount(entry, 'failsUncovered')).toBe(0);
    });

    test('has exactly 2 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(2);
    });

    test('1 covered, 1 uncovered', () => {
      expect(coveredCount(entry)).toBe(1);
      expect(uncoveredCount(entry)).toBe(1);
    });
  });

  // --- Skipped test coverage (no phantom hits) ---

  describe('skip-coverage: skipped tests produce no phantom coverage', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, SKIP_COV);
    });

    test('coveredByNonSkip has 1 hit (non-skipped test)', () => {
      expect(hitCount(entry, 'coveredByNonSkip')).toBe(1);
    });

    test('onlyInSkipped has 0 hits (skipped test never executes)', () => {
      expect(hitCount(entry, 'onlyInSkipped')).toBe(0);
    });

    test('has exactly 2 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(2);
    });

    test('1 covered, 1 uncovered', () => {
      expect(coveredCount(entry)).toBe(1);
      expect(uncoveredCount(entry)).toBe(1);
    });
  });

  // --- Cross-file coverage merging ---

  describe('cross-file-coverage: hit counts summed across test files', () => {
    let entry: FileCoverage;

    beforeAll(() => {
      entry = requireEntry(coverageMap, CROSS_FILE_COV);
    });

    test('sharedFunc has 5 hits (2 from file A + 3 from file B)', () => {
      expect(hitCount(entry, 'sharedFunc')).toBe(5);
    });

    test('fileAOnly has 1 hit (from file A only)', () => {
      expect(hitCount(entry, 'fileAOnly')).toBe(1);
    });

    test('fileBOnly has 1 hit (from file B only)', () => {
      expect(hitCount(entry, 'fileBOnly')).toBe(1);
    });

    test('has exactly 3 functions tracked', () => {
      expect(totalFunctions(entry)).toBe(3);
    });

    test('all functions covered', () => {
      expect(coveredCount(entry)).toBe(3);
      expect(uncoveredCount(entry)).toBe(0);
    });
  });
});
