import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
} from '../helpers/shared.js';

const FILING = `${COV_DIR}/branch-filing.meta.ts`;

// Per-arm branch hit counts for branch-filing.meta.ts. Each branch's then-arm has a
// foreign-inlined-default first located expression (the inlined default Const of
// `new Box()`). A correctly-filed decision (home-file arm-location fix) reads [1,1]
// since both arms are taken; the filing bug read [0,0] (decision mis-filed under
// the foreign class file, so this file's branch found no decision). Expecteds are
// derived from the inputs, NOT observed output.
describe.runIf(COVERAGE_ENABLED)('coverage collection — branch filing (home-file arm location)', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, FILING);
  });

  // 'if' branches by source position: [0] useDefaultCtorIf, [1] useExplicitCtorIf
  test('useDefaultCtorIf: foreign-inlined-default then-arm files under home file -> [1,1]', () => {
    // The regression guard: the bug read [0,0] here (decision mis-filed under the
    // foreign class file). The fix files it under this file → both arms matched.
    expect(branchHitsByType(entry, 'if')[0]).toEqual([1, 1]);
  });

  test('useExplicitCtorIf: home-located control -> [1,1]', () => {
    expect(branchHitsByType(entry, 'if')[1]).toEqual([1, 1]);
  });

  // 'cond-expr' branches by source position: [0] pickDefaultCtor
  test('pickDefaultCtor: foreign-inlined-default ternary then-arm files under home file -> [1,1]', () => {
    expect(branchHitsByType(entry, 'cond-expr')[0]).toEqual([1, 1]);
  });
});
