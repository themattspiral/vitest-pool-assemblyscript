import { describe, test, beforeAll } from 'vitest';
import {
  type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage,
} from '../helpers/shared.js';

const HOOK_ATTRIBUTION = `${COV_DIR}/function/hook-attribution.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('function coverage — lifecycle hook attribution', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // hooks-attribution.meta.test.ts has two passing tests; its beforeEach and
  // afterEach each call one instrumented function per test, so both read
  // exactly 2 — proving hook-driven execution counts normally and attributes
  // to the defining file. The never-called sibling pins that nothing else in
  // the file was swept in.
  test('functions called only from hooks count once per test', () => {
    expectFunctionCoverage(requireEntry(coverageMap, HOOK_ATTRIBUTION), {
      calledFromBeforeEach: 2,
      calledFromAfterEach: 2,
      neverCalledFromHooks: 0,
    });
  });
});
