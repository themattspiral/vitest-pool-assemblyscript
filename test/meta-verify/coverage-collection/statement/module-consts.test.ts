import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine,
} from '../../helpers/shared.js';

// A const-only AS source (no functions) vs its line-aligned v8 twin. Module-level
// constants fold to WASM globals with no runtime block, so NOTHING in the file is
// instrumented; the provider's loaded-file synthesis credits them covered, matching
// v8. The strongest test of the loaded-file signal — a file with no runtime counter.
const AS = `${COV_DIR}/statement/module-consts.meta.ts`;
const JS = 'js-coverage-parity-src/statement/module-consts.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — const-only module', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  test('each module-level const is covered (synthesized — ran at module load)', () => {
    expect(statementHitsByLine(as, 7)).toEqual([1]); // TABLE_SIZE
    expect(statementHitsByLine(as, 8)).toEqual([1]); // MAX_RETRIES
    expect(statementHitsByLine(as, 9)).toEqual([1]); // ENABLED
  });

  test('parity with v8 (line-aligned twin)', () => {
    for (const line of [7, 8, 9]) {
      expect(statementHitsByLine(as, line)).toEqual(statementHitsByLine(js, line));
    }
  });
});
