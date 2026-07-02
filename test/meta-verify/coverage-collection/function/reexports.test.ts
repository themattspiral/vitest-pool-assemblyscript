import { describe, test, beforeAll } from 'vitest';
import {
  type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage,
} from '../../helpers/shared.js';

const REEXPORT_ORIGINAL = `${COV_DIR}/function/reexport-original.meta.ts`;
const REEXPORT_BARREL = `${COV_DIR}/function/reexport-barrel.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('function coverage — re-exports', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // The original file owns both functions. originalFunc is reached only through the
  // barrel's re-export (covered); notReexported is never called.
  test('reexport-original: functions attributed to the defining file', () => {
    expectFunctionCoverage(requireEntry(coverageMap, REEXPORT_ORIGINAL), {
      originalFunc: 1,
      notReexported: 0,
    });
  });

  // A `export { originalFunc } from '...'` re-export does not create a function in
  // the barrel; the barrel tracks only the function it defines itself.
  test('reexport-barrel: tracks only its own function, not re-exported ones', () => {
    expectFunctionCoverage(requireEntry(coverageMap, REEXPORT_BARREL), {
      barrelOwn: 1,
    });
  });
});
