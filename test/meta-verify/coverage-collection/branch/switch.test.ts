import { describe, test, expect, beforeAll } from 'vitest';
import {
  type FileCoverage, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, branchHitsByType,
  hitCount, totalFunctions, allFunctionNames,
} from '../../helpers/shared.js';

const SWITCH = `${COV_DIR}/branch/switch.meta.ts`;
const JS_SWITCH = 'js-coverage-parity-src/branch/switch.ts';

// Per-arm switch branch hit counts for branch/switch.meta.ts, derived from the
// inputs in branch/switch.meta.test.ts and v8's "entered" semantics (an arm counts
// every time control enters it — by a matching case OR by falling through into it)
// — NOT from observed output. Empty fall-through cases are the primary guard: an
// untested empty case must read 0, an entered one its true count.
describe.runIf(COVERAGE_ENABLED)('coverage collection — switch branches', () => {
  let entry: FileCoverage;
  let jsEntry: FileCoverage;

  beforeAll(async () => {
    const { coverageMap } = await loadCoverageResults();
    entry = requireEntry(coverageMap, SWITCH);
    jsEntry = requireEntry(coverageMap, JS_SWITCH);
  });

  // switch branches by source position:
  //   [0] category   [1] dayType    [2] classifySign  [3] firstOnly  [4] emptyTrailing
  //   [5] cumulative [6] signBucket [7] colorName     [8] grid-outer [9] grid-inner
  //   [10] midDefault [11] fallthroughNoDefault [12] chainedEmpty
  const switches = (entry: FileCoverage): number[][] => branchHitsByType(entry, 'switch');

  test('category clean switch: case1 + default tested, case2 = 0', () => {
    expect(switches(entry)[0]).toEqual([1, 0, 1]);
  });

  test('dayType empty fall-through: entered empty case counted, untested empty case = 0', () => {
    // [case0(empty), case6(body), case1(empty), case2(body), default]
    expect(switches(entry)[1]).toEqual([1, 1, 0, 1, 1]);
  });

  test('classifySign no default: implicit default arm derived', () => {
    // [case0, case1, implicit-default]
    expect(switches(entry)[2]).toEqual([1, 0, 1]);
  });

  test('firstOnly break-only case: matched case counted via its break', () => {
    // [case0(break-only), case1, default]
    expect(switches(entry)[3]).toEqual([1, 0, 1]);
  });

  test('emptyTrailing empty-into-default: case2 entered once, default entered twice', () => {
    // [case1, case2(empty→default), default]; default = n=2 fallthrough + n=5 direct
    expect(switches(entry)[4]).toEqual([1, 1, 2]);
  });

  test('cumulative body fall-through: entered counts accumulate down the chain', () => {
    // [case1, case2, default]
    expect(switches(entry)[5]).toEqual([1, 2, 3]);
  });

  test('signBucket negative/large/sparse literals: untested case = 0', () => {
    // [case-5, case1000, case7, default]
    expect(switches(entry)[6]).toEqual([1, 1, 0, 1]);
  });

  test('colorName enum labels: tested Red + Blue, Green + default = 0', () => {
    // [Red, Green, Blue, default]
    expect(switches(entry)[7]).toEqual([1, 0, 1, 0]);
  });

  test('grid nested switch: outer and inner counted independently', () => {
    expect(switches(entry)[8]).toEqual([2, 1]); // outer [case0, default]
    expect(switches(entry)[9]).toEqual([1, 1]); // inner [case0, default]
  });

  test('midDefault default-in-middle: arms reported in source order', () => {
    // [case1, default, case2]
    expect(switches(entry)[10]).toEqual([1, 1, 0]);
  });

  test('fallthroughNoDefault empty fall-through + no default: implicit default derived from DISTINCT matches', () => {
    // [case1(empty), case2(body), case3, implicit-default]
    // case1 entered = 2 (matched twice); case2 entered = 2 (fall-through) + 1 = 3;
    // case3 = 1; implicit default = 1 (only n=9 matched no case). The implicit arm is
    // the # of switch entries that matched NO case, NOT switchReached − Σ(entered),
    // which double-counts case1's matches (already folded into case2's entered count).
    //
    // The implicit default counts only group-TERMINAL cases (those that don't fall
    // through into a successor) toward "distinct matches". Best-effort residual: a
    // CONDITIONAL break (`if (c) break;`) makes a case's fall-through runtime-dependent
    // while the classification is static, so the implicit default for such a case is
    // off by the count that conditionally broke out — covered/uncovered of the explicit
    // cases is unaffected. (Not exercised here; the empty/unconditional cases are exact.)
    expect(switches(entry)[11]).toEqual([2, 3, 1, 1]);
  });

  test('chainedEmpty two consecutive empty cases: entered counts telescope down the chain', () => {
    // [case0(empty), case1(empty), case2(body), case3(body), default]
    // case0 = 1 (n=0); case1 = 2 (n=1×2) + 1 (case0 fall-through) = 3;
    // case2 body = 1 (n=2) + 3 (case1 fall-through) = 4; case3 = 1; default = 1.
    // Full v8 parity (has a default) — also checked in the parity loop below.
    expect(switches(entry)[12]).toEqual([1, 3, 4, 1, 1]);
  });

  // v8-twin parity: js-coverage-parity-src/branch/switch.ts mirrors this fixture
  // construct-for-construct with identical inputs, so v8's switch coverage (delegated
  // to the same merged report) is the cross-check oracle. Arm hits match v8 for every
  // shape EXCEPT a default-less switch (classifySign) — documented below.
  describe('v8-twin parity', () => {
    const js = (): number[][] => switches(jsEntry);

    test('switch arms match v8 for every shape except the default-less switches', () => {
      expect(switches(entry)).toHaveLength(13);
      expect(js()).toHaveLength(13);
      for (let i = 0; i < 13; i++) {
        if (i === 2 || i === 11) continue; // default-less switches — documented divergences below
        expect(switches(entry)[i], `switch #${i}`).toEqual(js()[i]);
      }
    });

    test('default-less switch (classifySign): AS adds the implicit-default arm, v8 omits it', () => {
      // AS [case0, case1, implicit-default] = [1,0,1] — AS synthesizes the "no case
      // matched" path as a derived arm (as it does for an if-without-else);
      // v8's block-coverage→istanbul conversion does NOT emit that arm → [1,0]. The real
      // cases agree in both: case0 covered, case1 uncovered.
      expect(switches(entry)[2]).toEqual([1, 0, 1]);
      expect(js()[2]).toEqual([1, 0]);
    });

    test('default-less switch with fall-through (fallthroughNoDefault): explicit arms match v8; AS adds the implicit default', () => {
      // The explicit cases agree with v8's "entered" counts (case1=2, case2=3, case3=1);
      // AS additionally synthesizes the implicit-default arm (=1), which v8 omits — the
      // same set-difference as classifySign, but with fall-through to guard the implicit
      // default derivation against double-counting case1's matches.
      expect(switches(entry)[11]).toEqual([2, 3, 1, 1]);
      expect(js()[11]).toEqual([2, 3, 1]);
    });

    test('function coverage matches v8 exactly', () => {
      expect(totalFunctions(entry)).toBe(totalFunctions(jsEntry));
      for (const name of allFunctionNames(jsEntry)) {
        expect(hitCount(entry, name), `fn ${name}`).toBe(hitCount(jsEntry, name));
      }
    });
  });
});
