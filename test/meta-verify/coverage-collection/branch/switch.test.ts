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
  //   [10] midDefault
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

  // v8-twin parity: js-coverage-parity-src/branch/switch.ts mirrors this fixture
  // construct-for-construct with identical inputs, so v8's switch coverage (delegated
  // to the same merged report) is the cross-check oracle. Arm hits match v8 for every
  // shape EXCEPT a default-less switch (classifySign) — documented below.
  describe('v8-twin parity', () => {
    const js = (): number[][] => switches(jsEntry);

    test('switch arms match v8 for every shape except the default-less switch', () => {
      expect(switches(entry)).toHaveLength(11);
      expect(js()).toHaveLength(11);
      for (let i = 0; i < 11; i++) {
        if (i === 2) continue; // classifySign — documented divergence below
        expect(switches(entry)[i], `switch #${i}`).toEqual(js()[i]);
      }
    });

    test('default-less switch (classifySign): AS adds the implicit-default arm, v8 omits it', () => {
      // AS [case0, case1, implicit-default] = [1,0,1] — the "no case matched" path is a
      // derived arm, matching istanbul-lib-instrument's source-instrumentation convention.
      // v8's block-coverage→istanbul conversion does NOT emit that arm → [1,0]. The real
      // cases agree in both: case0 covered, case1 uncovered.
      expect(switches(entry)[2]).toEqual([1, 0, 1]);
      expect(js()[2]).toEqual([1, 0]);
    });

    test('function coverage matches v8 exactly', () => {
      expect(totalFunctions(entry)).toBe(totalFunctions(jsEntry));
      for (const name of allFunctionNames(jsEntry)) {
        expect(hitCount(entry, name), `fn ${name}`).toBe(hitCount(jsEntry, name));
      }
    });
  });
});
