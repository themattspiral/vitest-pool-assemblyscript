import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, hitCount, statementHitsByLine,
} from '../helpers/shared.js';

// Regression guard for the runtime-dependent coverage fixes. The runtime-coverage
// source is compiled under BOTH the default (stub) runtime and --runtime incremental
// (the as-pool-meta + as-pool-meta-incremental projects), and the provider accumulates
// the two binaries' coverage by source position. Each function is called once per
// runtime, so the correct accumulated count is 2.
//
// Without the breadth-first representative-location search, the incremental runtime
// restructures skipUnderIncremental's body so that no representative location is found
// and the function is skipped from instrumentation -- the accumulated count would drop
// to 1 (stub only). Without the per-function SUM combiner, driftAcrossRuntimes' hits
// split across its two (per-runtime) representative locations and are max-combined --
// also dropping to 1. So a reading of 1 for either is the regression these guard.

const SRC = `${COV_DIR}/runtime-coverage.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — runtime-dependent skip/drift (stub + incremental accumulation)', () => {
  let entry: FileCoverage;
  beforeAll(async () => {
    const map: CoverageMap = (await loadCoverageResults()).coverageMap;
    entry = requireEntry(map, SRC);
  });

  describe('skip case — instrumented under incremental via the breadth-first rep-loc search', () => {
    test('skipUnderIncremental accumulates to 2 (1 stub + 1 incremental), not 1', () => {
      expect(hitCount(entry, 'skipUnderIncremental')).toBe(2);
    });
    test('its body statements accumulate to 2; the unreachable return is 0', () => {
      expect(statementHitsByLine(entry, 24)).toEqual([2]); // const c = new Box(5)
      expect(statementHitsByLine(entry, 25)).toEqual([2]); // return c.v
      expect(statementHitsByLine(entry, 27)).toEqual([0]); // return -1 (unreachable)
    });
  });

  describe('drift case — hits summed across the per-runtime rep-locs', () => {
    test('driftAcrossRuntimes accumulates to 2 (summed, not max-combined), not 1', () => {
      expect(hitCount(entry, 'driftAcrossRuntimes')).toBe(2);
    });
    test('its body statements accumulate to 2', () => {
      expect(statementHitsByLine(entry, 35)).toEqual([2]); // const c = new Box(7)
      expect(statementHitsByLine(entry, 36)).toEqual([2]); // const w = c.v + 1
      expect(statementHitsByLine(entry, 37)).toEqual([2]); // return w
    });
  });
});
