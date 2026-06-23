import { describe, test, beforeAll } from 'vitest';
import {
  type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage,
} from '../../helpers/shared.js';

const INLINE_FUNCTIONS = `${COV_DIR}/function/inline-functions.meta.ts`;
const GENERIC_FUNCTIONS = `${COV_DIR}/function/generic-functions.meta.ts`;
const EMPTY_FUNCTIONS = `${COV_DIR}/function/empty-functions.meta.ts`;
const TRAP_COVERAGE = `${COV_DIR}/function/trap-coverage.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('function coverage — special forms', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // With the default stripInline, @inline decorators are removed so the inlined
  // function compiles as a real function and stays visible in coverage. inlinedAdd is
  // hit twice: once directly, once via the (inlined) call inside callsInlined.
  test('@inline functions counted (direct + inlined call)', () => {
    expectFunctionCoverage(requireEntry(coverageMap, INLINE_FUNCTIONS), {
      inlinedAdd: 2,
      normalAdd: 1,
      callsInlined: 1,
    });
  });

  // Monomorphized specializations sum into the single source function: identity is
  // called as <i32>, <f64>, <string> (3), isNull as non-null + null (2).
  test('generic functions sum monomorphized variant hits', () => {
    expectFunctionCoverage(requireEntry(coverageMap, GENERIC_FUNCTIONS), {
      identity: 3,
      isNull: 2,
      nonGeneric: 1,
    });
  });

  // emptyVoid has no body → no source location → not tracked at all (omitted from the
  // expected set). The two real functions are tracked.
  test('empty-body function is untracked; minimal bodies tracked', () => {
    expectFunctionCoverage(requireEntry(coverageMap, EMPTY_FUNCTIONS), {
      returnsZero: 1,
      nonEmpty: 1,
    });
  });

  // Entry counting: a function records a hit on entry, so willTrap counts even though
  // it aborts mid-body.
  test('trapping function still counted (entry counting)', () => {
    expectFunctionCoverage(requireEntry(coverageMap, TRAP_COVERAGE), {
      calledBeforeTrap: 1,
      willTrap: 1,
    });
  });
});
