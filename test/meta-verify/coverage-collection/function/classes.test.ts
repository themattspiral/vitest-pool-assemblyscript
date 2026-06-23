import { describe, test, beforeAll } from 'vitest';
import {
  type CoverageMap, COV_DIR, COVERAGE_ENABLED,
  loadCoverageResults, requireEntry, expectFunctionCoverage,
} from '../../helpers/shared.js';

const CLASSES = `${COV_DIR}/function/classes.meta.ts`;
const OPERATOR = `${COV_DIR}/function/operator-overload.meta.ts`;
const CLASS_UNUSED = `${COV_DIR}/function/class-utils-unused.meta.ts`;

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
});
