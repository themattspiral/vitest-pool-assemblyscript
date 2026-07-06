import { describe, test, beforeAll } from 'vitest';
import {
  type CoverageMap, COV_DIR, COVERAGE_ENABLED, JS_COVERAGE_PROVIDER,
  loadCoverageResults, requireEntry, expectFunctionCoverage, expectFunctionParityByLine,
} from '../../helpers/shared.js';

const CLASSES = `${COV_DIR}/function/classes.meta.ts`;
const OPERATOR = `${COV_DIR}/function/operator-overload.meta.ts`;
const CLASS_UNUSED = `${COV_DIR}/function/class-utils-unused.meta.ts`;
const JS_CLASSES = 'js-coverage-parity-src/function/classes.ts';

describe.runIf(COVERAGE_ENABLED)('function coverage — classes', () => {
  let coverageMap: CoverageMap;

  beforeAll(async () => {
    coverageMap = (await loadCoverageResults()).coverageMap;
  });

  // Counter exercises every member kind (constructor / method / getter / covered
  // setter / static / uncovered method) under Class#member and Class.static naming;
  // the Animal/Dog/Cat trio exercises inheritance, where each subclass super() call
  // counts toward Animal#constructor (4 Dog + 3 Cat = 7), an overridden method
  // (Dog#move), and an inherited one (Animal#move, called once via Cat). The four
  // classes are tracked independently — note Animal#move and Dog#move share a method
  // name but distinct counts.
  test('member kinds, naming, inheritance + super, and independence', () => {
    expectFunctionCoverage(requireEntry(coverageMap, CLASSES), {
      'Counter#constructor': 1,
      'Counter#increment': 2,
      'Counter#get:value': 1,
      'Counter#set:value': 1,
      'Counter#reset': 0,
      'Counter.make': 0,
      'Animal#constructor': 7,
      'Animal#speak': 2,
      'Animal#move': 1,
      'Animal#get:name': 1,
      'Dog#constructor': 4,
      'Dog#move': 1,
      'Dog#bark': 1,
      'Cat#constructor': 3,
      'Cat#meow': 1,
    });
  });

  // @operator-decorated methods are tracked as static-style Class.method entries.
  // a + b builds a third Vec2 (3 ctors), a == b builds two (2), length one (1) → 6.
  test('operator overloads tracked (Class.operator naming)', () => {
    expectFunctionCoverage(requireEntry(coverageMap, OPERATOR), {
      'Vec2#constructor': 6,
      'Vec2.add': 1,
      'Vec2.equals': 1,
      'Vec2#length': 1,
    });
  });

  // A class file never imported by any test: all members appear, all uncovered —
  // including the setter (the covered-setter counterpart lives on Counter above).
  test('fully-unused class: all members tracked at 0', () => {
    expectFunctionCoverage(requireEntry(coverageMap, CLASS_UNUSED), {
      'UnusedCounter#constructor': 0,
      'UnusedCounter#increment': 0,
      'UnusedCounter#get:count': 0,
      'UnusedCounter#set:count': 0,
      'UnusedCounter.createDefault': 0,
      'UnusedCounter#tripleCount': 0,
      'UnusedCounter#getTripled': 0,
    });
  });

  // classes.ts mirrors classes.meta.ts line-for-line with the same instantiation
  // pattern (the @operator case is AS-only and excluded), so the JS twin's function
  // coverage is the oracle. Pairing is by start line because v8 names methods bare and
  // disambiguates duplicates with _N suffixes (constructor, constructor_2, value,
  // value_2 …) — unusable as pairing keys. Constructor/method/getter/setter counts and
  // the super()-driven Animal#constructor=7 all match the JS twin; the remaining
  // divergences are provider-specific:
  describe('JS-twin parity', () => {
    test('function coverage matches the JS twin except documented divergences', () => {
      const as = requireEntry(coverageMap, CLASSES);
      const js = requireEntry(coverageMap, JS_CLASSES);
      expectFunctionParityByLine(as, js, {
        // Empty-body: Marker's empty constructor (line 84) has no source location for AS
        // to instrument, so AS drops it; both JS providers keep it (at 0).
        jsOnlyLines: [84],
        // Uncalled static method: Counter.make (line 32) is never called. Under v8 it is
        // reported as covered (1) — a remapper quirk where a never-called static still
        // shows a hit — while AS counts function entries and reports the execution-accurate
        // 0. istanbul's counters are execution-accurate and agree with AS (0), so there is
        // no divergence under istanbul.
        divergentHitLines: JS_COVERAGE_PROVIDER === 'v8' ? { 32: [0, 1] } : {},
      });
    });
  });
});
