import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
} from '../helpers/shared.js';

const SHARED = `${COV_DIR}/branch-shared.meta.ts`;

// branch-shared.meta.ts is imported by two test files (a + b), so it is compiled
// into two separate binaries. File A exercises only the THEN arm (twice), file B
// only the ELSE arm (once). The accumulated [2,1] is the D7 stability invariant: it
// is only correct if branch hits sum across both binaries by the source-derived
// decision key. A=only would read [2,0], B=only [0,1]. Derived from the inputs.
describe.runIf(COVERAGE_ENABLED)('coverage collection — cross-file shared branch', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, SHARED);
  });

  test('sharedBranch if: hits sum across both importing files -> [2,1]', () => {
    expect(branchHitsByType(entry, 'if')[0]).toEqual([2, 1]);
  });
});
