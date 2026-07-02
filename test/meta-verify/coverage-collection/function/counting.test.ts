import { describe, test, beforeAll } from 'vitest';
import {
  type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage, expectFunctionParityByLine,
} from '../../helpers/shared.js';

const COUNTING = `${COV_DIR}/function/counting.meta.ts`;
const UNUSED = `${COV_DIR}/function/standalone-unused.meta.ts`;
const JS_COUNTING = 'js-coverage-parity-src/function/counting.ts';

describe.runIf(COVERAGE_ENABLED)('function coverage — counting', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // Hit-count spectrum across the explicit calls in counting.meta.test.ts: a never-
  // called function reads 0, recursion produces one entry per call (countdown(4) → 5),
  // and the monomorphized identity sums its i32 + f64 specializations (→ 2).
  test('hit-count spectrum, recursion, and monomorphization summing', () => {
    expectFunctionCoverage(requireEntry(coverageMap, COUNTING), {
      calledOnce: 1,
      calledTwice: 2,
      calledThrice: 3,
      calledFiveTimes: 5,
      neverCalled: 0,
      countdown: 5,
      identity: 2,
    });
  });

  // A source file matched by the coverage include but never imported by any test: all
  // of its functions appear in the report, all uncovered.
  test('fully-unused file: every function tracked at 0', () => {
    expectFunctionCoverage(requireEntry(coverageMap, UNUSED), {
      unusedHelperA: 0,
      unusedHelperB: 0,
      unusedHelperC: 0,
    });
  });

  // counting.ts mirrors counting.meta.ts line-for-line with the same call sequence, so
  // v8's function coverage is the oracle. Full parity, including the monomorphized
  // identity: AS sums its i32 + f64 specializations to 2, v8 counts the one TS function
  // twice to 2.
  describe('v8-twin parity', () => {
    test('function hit counts match v8 line-for-line', () => {
      const as = requireEntry(coverageMap, COUNTING);
      const js = requireEntry(coverageMap, JS_COUNTING);
      expectFunctionParityByLine(as, js);
    });
  });
});
