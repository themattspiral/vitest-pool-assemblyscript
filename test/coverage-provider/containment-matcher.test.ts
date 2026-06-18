import { describe, test, expect } from 'vitest';

import { buildHitsByLine, findStatementEntryHitCount } from '../../src/coverage-provider/containment-matcher.js';
import type { SourceRange } from '../../src/types/types.js';

const FILE = '/proj/assembly/x.ts';
function range(startLine: number, startColumn: number, endLine: number, endColumn: number): SourceRange {
  return { filePath: FILE, startLine, startColumn, endLine, endColumn };
}

describe('buildHitsByLine', () => {
  test('buckets positions by line, preserving column entries', () => {
    const m = buildHitsByLine({ '10:3': 5, '10:7': 2, '12:1': 9 });
    expect(m.get(10)).toEqual([{ column: 3, count: 5 }, { column: 7, count: 2 }]);
    expect(m.get(12)).toEqual([{ column: 1, count: 9 }]);
    expect(m.get(99)).toBeUndefined();
  });

  test('ignores malformed keys', () => {
    const m = buildHitsByLine({ bad: 1, '10:x': 2, '10:3': 4 });
    expect(m.get(10)).toEqual([{ column: 3, count: 4 }]);
  });
});

describe('findStatementEntryHitCount', () => {
  test('single-line statement: entry = smallest-column in-range hit', () => {
    const hits = buildHitsByLine({ '10:3': 5, '10:7': 2 });
    expect(findStatementEntryHitCount(hits, range(10, 1, 10, 20))).toBe(5);
  });

  test('compound statement: entry (header) count, NOT the hotter body (D11)', () => {
    // `if` condition on line 3 (col 7) reached 4 times; body on line 4 (col 5) runs 9 times.
    // The statement count must be the entry (4), never the body (9).
    const hits = buildHitsByLine({ '3:7': 4, '4:5': 9 });
    expect(findStatementEntryHitCount(hits, range(3, 1, 5, 4))).toBe(4);
  });

  test('returns 0 when no hit falls within the range (uncovered statement)', () => {
    const hits = buildHitsByLine({ '10:3': 5 });
    expect(findStatementEntryHitCount(hits, range(20, 1, 22, 5))).toBe(0);
  });

  test('excludes a hit before the start column on the start line', () => {
    const hits = buildHitsByLine({ '10:2': 99, '10:8': 7 });
    expect(findStatementEntryHitCount(hits, range(10, 5, 10, 20))).toBe(7);
  });

  test('excludes a hit after the end column on the end line', () => {
    const hits = buildHitsByLine({ '5:30': 99 });
    expect(findStatementEntryHitCount(hits, range(3, 1, 5, 10))).toBe(0);
  });

  test('falls to a later line when the start line has no in-range hit', () => {
    const hits = buildHitsByLine({ '4:5': 6, '5:1': 8 });
    expect(findStatementEntryHitCount(hits, range(3, 1, 6, 10))).toBe(6);
  });
});
