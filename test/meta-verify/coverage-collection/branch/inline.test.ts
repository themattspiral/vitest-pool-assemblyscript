import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType, hitCount,
} from '../../helpers/shared.js';

// The branch lives in an @inline helper. Compiled with stripInline:false the
// @inline decorator is HONORED, so inlineGate is INLINED into useInlineGate (another
// file) and its standalone is never called. The DIFFERENTIATOR for "this actually
// tests inlining" is inlineGate's function coverage reading 0 (inlined away) — under
// stripInline:true it would be a normal called function with > 0 hits. With inlining
// established by that 0, the inlined if-branch still reads [1,1], attributed back to
// the @inline source from the inlined copy's execution (foreign @inline locations
// kept). Expecteds derived from the inputs, NOT observed output.
const INLINE_HELPER = `${COV_DIR}/branch/inline-helper.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — inlined branch (@inline, stripInline:false)', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, INLINE_HELPER);
  });

  test('@inline branch: covered via the inlined copy, attributed to its source', () => {
    // With stripInline:false the @inline decorator on inlineGate is kept (not
    // stripped), so AS inlines inlineGate into useInlineGate and its standalone is
    // never called -> 0 function hits. That 0 is the DIFFERENTIATOR: under
    // stripInline:true inlineGate would be a normal called function (2 hits here), so
    // its expected value changes with the condition (0 vs 2) -- unlike the [1,1]
    // branch count, which is identical under both. Combined, function = 0 and branch
    // = [1,1] prove the branch's hits come from the inlined copy (no standalone ran),
    // attributed back to the @inline source.
    expect(hitCount(entry, 'inlineGate')).toBe(0);
    expect(branchHitsByType(entry, 'if')[0]).toEqual([1, 1]);
  });
});
