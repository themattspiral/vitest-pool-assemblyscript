import { describe, test, beforeAll } from 'vitest';
import {
  type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage,
} from '../../helpers/shared.js';

const TOP_LEVEL_CODE = `${COV_DIR}/function/top-level-code.meta.ts`;
const NAMESPACE_FUNCTIONS = `${COV_DIR}/function/namespace-functions.meta.ts`;
const NAMESPACE_CLASSES = `${COV_DIR}/function/namespace-classes.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('function coverage — module-level features', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // helper() runs at module init — the COMPUTED and DOUBLE_COMPUTED top-level
  // initializers call it twice on every instantiation — plus one direct call in the
  // first test. Each test in modules.meta.test.ts instantiates a fresh WASM module,
  // re-running the top-level code, so helper = 2×(9 tests in the file) + 1 = 19.
  // COMPUTED / DOUBLE_COMPUTED / LITERAL are consts, not functions, so the file
  // tracks exactly two functions (helper, readComputed).
  test('top-level-code: module-scope initializers counted as function hits', () => {
    expectFunctionCoverage(requireEntry(coverageMap, TOP_LEVEL_CODE), {
      helper: 19,
      readComputed: 1,
    });
  });

  // Namespace functions are tracked under namespace-prefixed names (MathUtils.square)
  // to match the binary naming convention and disambiguate across namespaces. unused
  // is never called; topLevel is the non-namespaced control. The exact name set is
  // the naming-convention assertion.
  test('namespace-functions: namespace-prefixed naming and discovery', () => {
    expectFunctionCoverage(requireEntry(coverageMap, NAMESPACE_FUNCTIONS), {
      'MathUtils.square': 1,
      'MathUtils.cube': 1,
      'MathUtils.unused': 0,
      topLevel: 1,
    });
  });

  // Two namespaces each declare an identically-structured Dog class; each is tracked
  // independently under its namespace-qualified name. The filler classes (empty
  // constructors → no source location → untracked) exist to push the namespace
  // classes' coverage indices past the deep-equals-method truncation boundary a
  // previous extraction bug mis-handled, so the four real methods are exactly what
  // gets tracked.
  test('namespace-classes: per-namespace independence, fillers untracked', () => {
    expectFunctionCoverage(requireEntry(coverageMap, NAMESPACE_CLASSES), {
      'Animals.Dog#constructor': 2,
      'Animals.Dog#speak': 1,
      'Robots.Dog#constructor': 2,
      'Robots.Dog#speak': 1,
    });
  });
});
