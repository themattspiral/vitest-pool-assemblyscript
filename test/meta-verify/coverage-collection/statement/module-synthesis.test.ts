import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine,
} from '../../helpers/shared.js';

// End-to-end proof of the synthesis DECISION (not just the AST flag): an
// unconditional module-scope const/let is synthesized covered, while a const placed
// inside a module-level block whose branch never runs is NOT synthesized and reads
// its real 0 — matching v8 on both. Line-aligned with the v8 twin.
const AS = `${COV_DIR}/statement/module-synthesis.meta.ts`;
const JS = 'js-coverage-parity-src/statement/module-synthesis.ts';

describe.runIf(COVERAGE_ENABLED)('coverage collection — module-declaration synthesis', () => {
  let as: FileCoverage;
  let js: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    as = requireEntry(coverageMap, AS);
    js = requireEntry(coverageMap, JS);
  });

  test('unconditional module const + let are synthesized covered (match v8)', () => {
    expect(statementHitsByLine(as, 7)).toEqual([1]); // ALWAYS_CONST
    expect(statementHitsByLine(as, 8)).toEqual([1]); // ALWAYS_LET
    expect(statementHitsByLine(js, 7)).toEqual([1]);
    expect(statementHitsByLine(js, 8)).toEqual([1]);
  });

  test('a conditional (in-block) const is NOT synthesized — reads its real 0, matching v8', () => {
    // gate() is false, so the block never runs. The flag must NOT credit this const
    // just because the file loaded (the whole point of the block-depth refinement).
    expect(statementHitsByLine(as, 11)).toEqual([0]); // const NEVER
    expect(statementHitsByLine(js, 11)).toEqual([0]);
  });
});
