import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, statementHitsByLine, hitCount,
} from '../../helpers/shared.js';

// computeStat is @inline; with stripInline:false it is inlined into useComputeStat
// (another file) and its standalone is never called. Its statements still execute via
// the inlined copy and are attributed back to this source. AS-only: @inline has no JS
// coverage equivalent here, so there is no v8 twin to compare against.
const INLINE_HELPER = `${COV_DIR}/statement/inline-helper.meta.ts`;

describe.runIf(COVERAGE_ENABLED)('coverage collection — inlined statements (@inline, stripInline:false)', () => {
  let entry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, INLINE_HELPER);
  });

  test('@inline statements: covered via the inlined copy, attributed to source; standalone fn = 0', () => {
    // Differentiator: stripInline:false inlines computeStat into useComputeStat, so its
    // standalone is never called -> 0 function hits (under stripInline:true it would be
    // a normal called function with > 0). With that 0 establishing inlining, the body
    // statements still read 2 (the call count, from the inlined copy), attributed back
    // to the @inline source. Derived from the inputs, not observed output.
    expect(hitCount(entry, 'computeStat')).toBe(0);
    expect(statementHitsByLine(entry, 12)).toEqual([2]); // let doubled = n * 2
    expect(statementHitsByLine(entry, 13)).toEqual([2]); // let result = doubled + 1
    expect(statementHitsByLine(entry, 14)).toEqual([2]); // return result
  });
});
