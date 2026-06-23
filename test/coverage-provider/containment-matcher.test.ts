import { describe, test, expect } from 'vitest';

import {
  buildHitsByLine,
  findStatementEntryHitCount,
  buildArmsByLine,
  findArmAtRangeEntry,
  buildDecisionPositionsByLine,
  conditionRangeContainsDecision,
  computeBranchPathHits,
} from '../../src/coverage-provider/containment-matcher.js';
import type { BranchPathHits, ParsedSourceBranchInfo, SourceRange } from '../../src/types/types.js';

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

  test('compound statement: entry (header) count, NOT the hotter body', () => {
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

// ── Branch matching helpers ──

/** Build a fileBranchHits decision record: one located arm per [line, col, hits]. */
function decision(
  decisionHits: number | null,
  arms: Array<[line: number, column: number, hits: number]>,
): BranchPathHits {
  return {
    decisionHits,
    targets: arms.map(([line, column, hits]) => ({ hits, location: { filePath: FILE, line, column } })),
  };
}

function branch(
  branchType: ParsedSourceBranchInfo['branchType'],
  whole: SourceRange,
  conditionRange: SourceRange,
  paths: SourceRange[],
  implicitPathIndices: number[] = [],
  emptyCasePathIndices: number[] = [],
): ParsedSourceBranchInfo {
  return { range: whole, branchType, conditionRange, paths, implicitPathIndices, emptyCasePathIndices };
}

describe('buildArmsByLine', () => {
  test('buckets arm target locations by line with decision key + decisionHits', () => {
    const armsByLine = buildArmsByLine({
      '2:5|4:5': decision(5, [[2, 5, 3], [4, 5, 2]]),
    });
    expect(armsByLine.get(2)).toEqual([{ column: 5, armHits: 3, decisionKey: '2:5|4:5', decisionHits: 5 }]);
    expect(armsByLine.get(4)).toEqual([{ column: 5, armHits: 2, decisionKey: '2:5|4:5', decisionHits: 5 }]);
    expect(armsByLine.get(9)).toBeUndefined();
  });

  test('carries a null decisionHits through (fused-logical decision)', () => {
    const armsByLine = buildArmsByLine({ '2:5': decision(null, [[2, 5, 3]]) });
    expect(armsByLine.get(2)?.[0]?.decisionHits).toBeNull();
  });
});

describe('findArmAtRangeEntry', () => {
  test('finds the smallest-position arm within a range', () => {
    const armsByLine = buildArmsByLine({ '2:5|2:9': decision(7, [[2, 5, 3], [2, 9, 4]]) });
    expect(findArmAtRangeEntry(armsByLine, range(2, 1, 2, 20))?.armHits).toBe(3);
  });

  test('returns undefined when no arm falls within the range', () => {
    const armsByLine = buildArmsByLine({ '2:5': decision(7, [[2, 5, 3]]) });
    expect(findArmAtRangeEntry(armsByLine, range(10, 1, 12, 5))).toBeUndefined();
  });

  test('isolates the outer arm (earlier entry) from a nested arm in a containing range', () => {
    // outer-then arm at 2:5; nested-then arm at 3:7. The outer then-range spans 2-4.
    const armsByLine = buildArmsByLine({
      '2:5': decision(5, [[2, 5, 4]]),     // outer decision arm
      '3:7': decision(3, [[3, 7, 2]]),     // nested decision arm
    });
    expect(findArmAtRangeEntry(armsByLine, range(2, 5, 4, 2))?.armHits).toBe(4); // outer
    expect(findArmAtRangeEntry(armsByLine, range(3, 7, 3, 12))?.armHits).toBe(2); // nested (tighter)
  });
});

describe('computeBranchPathHits', () => {
  const noExprHits = buildHitsByLine({});
  const noCaseHits = buildHitsByLine({});
  // No decision positions ⇒ every branch is detected as folded.
  const noDecisions = buildDecisionPositionsByLine([]);
  // A decision at a branch's condition entry ⇒ NOT folded (the normal path).
  const decided = (b: ParsedSourceBranchInfo) =>
    buildDecisionPositionsByLine([`${b.conditionRange.startLine}:${b.conditionRange.startColumn}`]);

  test('if/else: each path = its matched arm hits', () => {
    const armsByLine = buildArmsByLine({ '2:5|4:5': decision(5, [[2, 5, 3], [4, 5, 2]]) });
    const b = branch('if', range(1, 1, 5, 2), range(1, 5, 1, 7),
      [range(1, 8, 3, 2), range(3, 9, 5, 2)]);
    expect(computeBranchPathHits(b, armsByLine, noExprHits, noCaseHits, decided(b))).toEqual([3, 2]);
  });

  test('if without else: implicit else = decisionHits - matched then (counted decision)', () => {
    const armsByLine = buildArmsByLine({ '2:5': decision(5, [[2, 5, 3]]) });
    const b = branch('if', range(1, 1, 3, 2), range(1, 5, 1, 7),
      [range(1, 8, 3, 2), range(1, 1, 3, 2)], [1]);
    // then = 3; implicit else = 5 - 3 = 2
    expect(computeBranchPathHits(b, armsByLine, noExprHits, noCaseHits, decided(b))).toEqual([3, 2]);
  });

  test('fused-logical if without else: decisionHits derived from condition entry (null decision)', () => {
    // decision block uncounted (null) — derive decisionHits from the leftmost atom
    // `a` at the condition-range entry (1:5 → 5). then = 3 → implicit else = 5 - 3 = 2.
    const armsByLine = buildArmsByLine({ '2:5': decision(null, [[2, 5, 3]]) });
    const exprHits = buildHitsByLine({ '1:5': 5 });
    const b = branch('if', range(1, 1, 3, 2), range(1, 5, 1, 10),
      [range(1, 12, 3, 2), range(1, 1, 3, 2)], [1]);
    expect(computeBranchPathHits(b, armsByLine, exprHits, noCaseHits, decided(b))).toEqual([3, 2]);
  });

  test('implicit derivation clamps at zero', () => {
    const armsByLine = buildArmsByLine({ '2:5': decision(5, [[2, 5, 7]]) }); // then > decision
    const b = branch('if', range(1, 1, 3, 2), range(1, 5, 1, 7),
      [range(1, 8, 3, 2), range(1, 1, 3, 2)], [1]);
    expect(computeBranchPathHits(b, armsByLine, noExprHits, noCaseHits, decided(b))).toEqual([7, 0]);
  });

  test('ternary (cond-expr): both arms matched, no implicit', () => {
    const armsByLine = buildArmsByLine({ '1:9|1:15': decision(5, [[1, 9, 4], [1, 15, 1]]) });
    const b = branch('cond-expr', range(1, 5, 1, 20), range(1, 5, 1, 6),
      [range(1, 9, 1, 12), range(1, 15, 1, 18)]);
    expect(computeBranchPathHits(b, armsByLine, noExprHits, noCaseHits, decided(b))).toEqual([4, 1]);
  });

  test('switch with explicit default: each arm = its body statement-entry count', () => {
    // discriminant at 1:9 (reached 4×); case/default body entries at 2:5,3:5,4:5,5:5.
    // Switch reads body counts from expression hits, NOT arms.
    const exprHits = buildHitsByLine({ '1:9': 4, '2:5': 1, '3:5': 1, '4:5': 1, '5:5': 1 });
    const b = branch('switch', range(1, 1, 6, 2), range(1, 9, 1, 10),
      [range(2, 5, 2, 20), range(3, 5, 3, 20), range(4, 5, 4, 20), range(5, 5, 5, 20)]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, decided(b))).toEqual([1, 1, 1, 1]);
  });

  test('switch without default: implicit default = switch-reached - sum(case bodies)', () => {
    // discriminant at 1:9 (reached 10×); case bodies at 2:5 (2×) and 3:5 (3×).
    const exprHits = buildHitsByLine({ '1:9': 10, '2:5': 2, '3:5': 3 });
    const b = branch('switch', range(1, 1, 6, 2), range(1, 9, 1, 10),
      [range(2, 5, 2, 20), range(3, 5, 3, 20), range(1, 1, 6, 2)], [2]);
    // cases 2, 3; implicit default = 10 - (2 + 3) = 5
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, decided(b))).toEqual([2, 3, 5]);
  });

  test('switch empty fall-through case: empty read from caseHits, body from exprHits', () => {
    // case 0 (empty, clause line 2) entered 1× — surfaced in caseHits at the case-label
    // 2:9 (NOT in exprHits). case 6 (body line 4) entered 2× via exprHits at body 4:7.
    const exprHits = buildHitsByLine({ '1:9': 4, '4:7': 2 });
    const caseHits = buildHitsByLine({ '2:9': 1 });
    const b = branch('switch', range(1, 1, 6, 2), range(1, 9, 1, 10),
      [range(2, 5, 2, 11), range(4, 7, 5, 12)], [], [0]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, caseHits, decided(b))).toEqual([1, 2]);
  });

  test('switch untested empty case reads 0 — no leak from an adjacent body hit (the bug)', () => {
    // The empty case (path 0) was never entered, so it is absent from caseHits → 0.
    // A hot adjacent body hit (4:7 = 3) must NOT leak into the empty case's count;
    // reading the dedicated caseHits channel (not expressionHits over the clause) is
    // what prevents the false-covered data this fix targets.
    const exprHits = buildHitsByLine({ '1:9': 4, '4:7': 3 });
    const caseHits = buildHitsByLine({});
    const b = branch('switch', range(1, 1, 6, 2), range(1, 9, 1, 10),
      [range(2, 5, 2, 11), range(4, 7, 5, 12)], [], [0]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, caseHits, decided(b))).toEqual([0, 3]);
  });

  test('switch empty case + implicit default: implicit = reached - sum(empty + body)', () => {
    // discriminant reached 5×; empty case 0 = 1 (caseHits at 2:9), body case 1 = 1
    // (exprHits at 4:7); implicit default = 5 - (1 + 1) = 3.
    const exprHits = buildHitsByLine({ '1:9': 5, '4:7': 1 });
    const caseHits = buildHitsByLine({ '2:9': 1 });
    const b = branch('switch', range(1, 1, 6, 2), range(1, 9, 1, 10),
      [range(2, 5, 2, 11), range(4, 7, 5, 12), range(1, 1, 6, 2)], [2], [0]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, caseHits, decided(b))).toEqual([1, 1, 3]);
  });

  test('binary-expr &&: left = condition-entry count, right = short-circuit arm', () => {
    // left operand `a` at 1:5 evaluated 5 times; right operand `b` arm at 1:10 hit 3 times.
    const armsByLine = buildArmsByLine({ '1:10': decision(5, [[1, 10, 3]]) });
    const exprHits = buildHitsByLine({ '1:5': 5 });
    const b = branch('binary-expr', range(1, 5, 1, 11), range(1, 5, 1, 6),
      [range(1, 5, 1, 6), range(1, 10, 1, 11)]);
    expect(computeBranchPathHits(b, armsByLine, exprHits, noCaseHits, decided(b))).toEqual([5, 3]);
  });

  test('binary-expr: right arm unmatched yields 0 (left still from condition entry)', () => {
    const exprHits = buildHitsByLine({ '1:5': 5 });
    const b = branch('binary-expr', range(1, 5, 1, 11), range(1, 5, 1, 6),
      [range(1, 5, 1, 6), range(1, 10, 1, 11)]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, decided(b))).toEqual([5, 0]);
  });

  test('never-executed branch: derives 0, all paths uncovered', () => {
    const b = branch('if', range(1, 1, 3, 2), range(1, 5, 1, 7),
      [range(1, 8, 3, 2), range(1, 1, 3, 2)], [1]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), noExprHits, noCaseHits, decided(b))).toEqual([0, 0]);
  });

  // ── Folded (compile-time-constant) branches: condition range has NO decision ──

  test('folded if/else (true-fold): live then body covered, eliminated else reads 0', () => {
    // if(true){A}else{B}: A executed (2:5), B eliminated from the binary (absent).
    const exprHits = buildHitsByLine({ '2:5': 1 });
    const b = branch('if', range(1, 1, 5, 2), range(1, 5, 1, 9),
      [range(2, 5, 2, 10), range(4, 5, 4, 10)]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, noDecisions)).toEqual([1, 0]);
  });

  test('folded if/else (false-fold): eliminated then reads 0, live else body covered', () => {
    const exprHits = buildHitsByLine({ '4:5': 1 });
    const b = branch('if', range(1, 1, 5, 2), range(1, 5, 1, 9),
      [range(2, 5, 2, 10), range(4, 5, 4, 10)]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, noDecisions)).toEqual([0, 1]);
  });

  test('folded if without else (true-fold): then covered, implicit else 0', () => {
    const exprHits = buildHitsByLine({ '2:5': 1 });
    const b = branch('if', range(1, 1, 4, 2), range(1, 5, 1, 9),
      [range(2, 5, 2, 10), range(1, 1, 4, 2)], [1]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, noDecisions)).toEqual([1, 0]);
  });

  test('folded cond-expr (true-fold): live then arm covered, eliminated else 0', () => {
    const exprHits = buildHitsByLine({ '1:12': 1 });
    const b = branch('cond-expr', range(1, 5, 1, 20), range(1, 5, 1, 9),
      [range(1, 12, 1, 14), range(1, 17, 1, 19)]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, noDecisions)).toEqual([1, 0]);
  });

  test('folded binary-expr (left true → right evaluated): [reached, rightEvaluated]', () => {
    // true && (x>0): right operand survives → evaluated. reached=1, right=1.
    const exprHits = buildHitsByLine({ '1:12': 1 });
    const b = branch('binary-expr', range(1, 5, 1, 15), range(1, 5, 1, 9),
      [range(1, 5, 1, 9), range(1, 12, 1, 15)]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, noDecisions)).toEqual([1, 1]);
  });

  test('folded binary-expr (left false → right short-circuited): right reads 0', () => {
    // false && (x>0): right eliminated; only the result const survives at the left (1:5).
    const exprHits = buildHitsByLine({ '1:5': 1 });
    const b = branch('binary-expr', range(1, 5, 1, 15), range(1, 5, 1, 9),
      [range(1, 5, 1, 9), range(1, 12, 1, 15)]);
    expect(computeBranchPathHits(b, buildArmsByLine({}), exprHits, noCaseHits, noDecisions)).toEqual([1, 0]);
  });
});

describe('conditionRangeContainsDecision', () => {
  test('true when a decision position falls within the range', () => {
    const m = buildDecisionPositionsByLine(['3:7']);
    expect(conditionRangeContainsDecision(m, range(3, 1, 3, 20))).toBe(true);
  });

  test('false when no decision position is within the range (folded)', () => {
    const m = buildDecisionPositionsByLine(['3:7']);
    expect(conditionRangeContainsDecision(m, range(5, 1, 5, 20))).toBe(false);
  });

  test('empty map ⇒ always false (everything reads as folded)', () => {
    expect(conditionRangeContainsDecision(buildDecisionPositionsByLine([]), range(1, 1, 1, 10))).toBe(false);
  });

  test('respects column bounds on the start line', () => {
    const m = buildDecisionPositionsByLine(['1:3']);
    expect(conditionRangeContainsDecision(m, range(1, 5, 1, 20))).toBe(false); // col 3 < start col 5
  });
});
