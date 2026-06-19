import { describe, test, expect } from 'vitest';

import { buildExpressionHits, buildBranchHits, buildCaseHits, buildDecisionPositions } from '../../src/wasm-executor/coverage-extraction.js';
import type {
  BinaryDebugInfo,
  BranchHits,
  FunctionDebugInfo,
  ExpressionDebugInfo,
  BasicBlockDebugInfo,
} from '../../src/types/types.js';

const FILE = '/proj/assembly/math.ts';

// ── Minimal builders for crafting debug info ──

function expr(line: number, column: number): ExpressionDebugInfo {
  return { type: 'Binary', isBranch: false, location: { filePath: FILE, line, column } };
}

function block(
  index: number,
  coverageMemoryIndex: number | undefined,
  expressionIndices: number[],
): BasicBlockDebugInfo {
  return { index, isDecision: false, expressionIndices, branches: [], coverageMemoryIndex };
}

function func(
  expressions: ExpressionDebugInfo[],
  basicBlocks: BasicBlockDebugInfo[],
  name = 'fn',
): FunctionDebugInfo {
  return {
    wasmIndex: 0,
    name,
    representativeLocation: { filePath: FILE, line: 1, column: 1 },
    coverageMemoryIndex: 0,
    expressions,
    basicBlocks,
  };
}

/** One function at one source position, with the given counter values. */
function debugInfoFor(funcs: FunctionDebugInfo[], funcPositionKey = '1:1'): BinaryDebugInfo {
  return {
    debugSourceFiles: [FILE],
    functionsByFileAndPosition: { [FILE]: { [funcPositionKey]: funcs } },
    instrumentedFunctionCount: funcs.length,
    totalInstrumentationCounters: 32,
  };
}

const hits = (result: ReturnType<typeof buildExpressionHits>) => result.hitCountsByFileAndPosition[FILE] ?? {};

describe('buildExpressionHits', () => {
  test('attributes a block hit count to its located expression position', () => {
    // block at counter idx 5 contains expr[0] @ 10:3
    const di = debugInfoFor([func([expr(10, 3)], [block(0, 5, [0])])]);
    const counters = new Array(32).fill(0);
    counters[5] = 7;

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '10:3': 7 });
  });

  test('attributes a block hit to every located expression it contains', () => {
    // one block, two exprs at different positions, both get the block's count
    const di = debugInfoFor([func([expr(30, 1), expr(30, 9)], [block(0, 5, [0, 1])])]);
    const counters = new Array(32).fill(0);
    counters[5] = 3;

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '30:1': 3, '30:9': 3 });
  });

  test('takes MAX across blocks of one instance at the same position (dead Unreachable dup)', () => {
    // exprs[0] and [1] are both at 15:5 (the reachable statement + the dead
    // trailing Unreachable). Reachable block hit 4; dead block hit 0.
    // MAX(4, 0) = 4 — summing would wrongly report 4 (or clobber to 0).
    const di = debugInfoFor([
      func(
        [expr(15, 5), expr(15, 5)],
        [block(0, 5, [0]), block(1, 6, [1])],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[5] = 4;
    counters[6] = 0;

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '15:5': 4 });
  });

  test('MAX is order-independent (dead block listed first)', () => {
    const di = debugInfoFor([
      func(
        [expr(15, 5), expr(15, 5)],
        [block(0, 5, [0]), block(1, 6, [1])],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[5] = 0; // dead first
    counters[6] = 9; // reachable second

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '15:5': 9 });
  });

  test('SUMs across monomorphizations of the same source function', () => {
    // Two compiled instances at the same source position 20:1, each with a block
    // attributing to expr @ 22:7. counts 2 and 4 -> SUM = 6.
    const instanceA = func([expr(22, 7)], [block(0, 5, [0])], 'foo<i32>');
    const instanceB = func([expr(22, 7)], [block(0, 6, [0])], 'foo<f64>');
    const di = debugInfoFor([instanceA, instanceB], '20:1');
    const counters = new Array(32).fill(0);
    counters[5] = 2;
    counters[6] = 4;

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '22:7': 6 });
  });

  test('combines per-instance MAX then cross-instance SUM', () => {
    // Each instance has the same-position dup (MAX within), then the two
    // instances SUM. Instance A: MAX(5,1)=5. Instance B: MAX(3,0)=3. SUM = 8.
    const instanceA = func([expr(8, 2), expr(8, 2)], [block(0, 5, [0]), block(1, 6, [1])], 'g<i32>');
    const instanceB = func([expr(8, 2), expr(8, 2)], [block(0, 7, [0]), block(1, 8, [1])], 'g<u8>');
    const di = debugInfoFor([instanceA, instanceB], '7:1');
    const counters = new Array(32).fill(0);
    counters[5] = 5; counters[6] = 1; // instance A -> MAX 5
    counters[7] = 3; counters[8] = 0; // instance B -> MAX 3

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '8:2': 8 });
  });

  test('ignores uninstrumented blocks (no coverageMemoryIndex)', () => {
    // block[1] has no counter (empty/passthrough) — contributes nothing.
    const di = debugInfoFor([
      func([expr(40, 1), expr(41, 1)], [block(0, 5, [0]), block(1, undefined, [1])]),
    ]);
    const counters = new Array(32).fill(0);
    counters[5] = 2;

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '40:1': 2 });
  });

  test('reports zero-hit positions (uncovered located statements)', () => {
    const di = debugInfoFor([func([expr(50, 1)], [block(0, 5, [0])])]);
    const counters = new Array(32).fill(0); // counter 5 = 0

    expect(hits(buildExpressionHits(di, counters))).toEqual({ '50:1': 0 });
  });

  test('returns empty map when there are no instrumented functions', () => {
    const di: BinaryDebugInfo = {
      debugSourceFiles: [],
      functionsByFileAndPosition: {},
      instrumentedFunctionCount: 0,
      totalInstrumentationCounters: 0,
    };
    expect(buildExpressionHits(di, []).hitCountsByFileAndPosition).toEqual({});
  });
});

// ── Decision-block builder for branch tests ──

function decisionBlock(
  index: number,
  coverageMemoryIndex: number | undefined,
  expressionIndices: number[],
  targetBlockIndices: number[],
): BasicBlockDebugInfo {
  return {
    index,
    isDecision: true,
    expressionIndices,
    branches: targetBlockIndices.map(targetBlockIndex => ({ targetBlockIndex })),
    coverageMemoryIndex,
  };
}

const branchesOf = (result: BranchHits) => result.hitsByFileAndDecision[FILE] ?? {};
const loc = (line: number, column: number) => ({ filePath: FILE, line, column });

describe('buildBranchHits', () => {
  test('records decisionHits + per-arm hits for a decision with two located arms', () => {
    // block 0 = decision (counter 3, condition expr[2] @ 9:7) → arms blocks 1, 2
    // block 1 = then arm (counter 4, expr[0] @ 10:3); block 2 = else arm (counter 5, expr[1] @ 12:5)
    const di = debugInfoFor([
      func(
        [expr(10, 3), expr(12, 5), expr(9, 7)],
        [decisionBlock(0, 3, [2], [1, 2]), block(1, 4, [0]), block(2, 5, [1])],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[3] = 10; // decisionHits
    counters[4] = 6;  // then arm
    counters[5] = 4;  // else arm

    expect(branchesOf(buildBranchHits(di, counters))).toEqual({
      '10:3|12:5': {
        decisionHits: 10,
        targets: [
          { hits: 6, location: loc(10, 3) },
          { hits: 4, location: loc(12, 5) },
        ],
      },
    });
  });

  test('decisionHits is null when the decision block has no counter (fused-logical)', () => {
    // decision block (out-degree 2) with NO coverageMemoryIndex — an `if (a && b)`
    // whose decision branches on the synthetic logical result; arms are located.
    const di = debugInfoFor([
      func(
        [expr(10, 3), expr(12, 5)],
        [decisionBlock(0, undefined, [], [1, 2]), block(1, 4, [0]), block(2, 5, [1])],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[4] = 3;
    counters[5] = 2;

    expect(branchesOf(buildBranchHits(di, counters))).toEqual({
      '10:3|12:5': {
        decisionHits: null,
        targets: [
          { hits: 3, location: loc(10, 3) },
          { hits: 2, location: loc(12, 5) },
        ],
      },
    });
  });

  test('omits unlocated arm targets (implicit else/default — derived provider-side)', () => {
    // block 2 is the implicit-else/merge target: counter but NO located expression.
    const di = debugInfoFor([
      func(
        [expr(10, 3)],
        [decisionBlock(0, 3, [], [1, 2]), block(1, 4, [0]), block(2, 5, [])],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[3] = 8;
    counters[4] = 5;
    counters[5] = 99; // merge block count — not emitted (over-counts; derived instead)

    expect(branchesOf(buildBranchHits(di, counters))).toEqual({
      // key is the located arm only
      '10:3': {
        decisionHits: 8,
        targets: [{ hits: 5, location: loc(10, 3) }],
      },
    });
  });

  test('drops a decision entirely when it has no located arms', () => {
    const di = debugInfoFor([
      func([], [decisionBlock(0, 3, [], [1, 2]), block(1, 4, []), block(2, 5, [])]),
    ]);
    const counters = new Array(32).fill(0);
    counters[3] = 8; counters[4] = 5; counters[5] = 3;

    expect(branchesOf(buildBranchHits(di, counters))).toEqual({});
  });

  test('SUMs arm hits and decisionHits across monomorphizations of one source branch', () => {
    // Two instances at the same source position 20:1, identical arm positions.
    const instanceA = func(
      [expr(10, 3), expr(12, 5)],
      [decisionBlock(0, 3, [], [1, 2]), block(1, 4, [0]), block(2, 5, [1])],
      'pick<i32>',
    );
    const instanceB = func(
      [expr(10, 3), expr(12, 5)],
      [decisionBlock(0, 6, [], [1, 2]), block(1, 7, [0]), block(2, 8, [1])],
      'pick<f64>',
    );
    const di = debugInfoFor([instanceA, instanceB], '20:1');
    const counters = new Array(32).fill(0);
    counters[3] = 3; counters[4] = 2; counters[5] = 1; // instance A
    counters[6] = 4; counters[7] = 1; counters[8] = 3; // instance B

    expect(branchesOf(buildBranchHits(di, counters))).toEqual({
      '10:3|12:5': {
        decisionHits: 7, // 3 + 4
        targets: [
          { hits: 3, location: loc(10, 3) }, // 2 + 1
          { hits: 4, location: loc(12, 5) }, // 1 + 3
        ],
      },
    });
  });

  test('null decisionHits stays null across monomorphizations', () => {
    const a = func([expr(10, 3), expr(12, 5)],
      [decisionBlock(0, undefined, [], [1, 2]), block(1, 4, [0]), block(2, 5, [1])], 'f<i32>');
    const b = func([expr(10, 3), expr(12, 5)],
      [decisionBlock(0, undefined, [], [1, 2]), block(1, 6, [0]), block(2, 7, [1])], 'f<u8>');
    const di = debugInfoFor([a, b], '20:1');
    const counters = new Array(32).fill(0);
    counters[4] = 1; counters[5] = 1; counters[6] = 1; counters[7] = 1;

    expect(branchesOf(buildBranchHits(di, counters))['10:3|12:5']?.decisionHits).toBeNull();
  });

  test('ignores non-decision blocks', () => {
    // No isDecision block → no branch hits even though blocks have counters.
    const di = debugInfoFor([func([expr(10, 3)], [block(0, 4, [0])])]);
    const counters = new Array(32).fill(0);
    counters[4] = 9;

    expect(branchesOf(buildBranchHits(di, counters))).toEqual({});
  });

  test('arm location prefers the home-file expression over a foreign inlined one', () => {
    // then-arm (block 1) leads with a FOREIGN inlined expr (e.g. a default-param
    // Const inlined from another file's constructor) before its home-file expr.
    // The arm must be located by the HOME-file expr (10:3), so the decision files
    // under the home file and the arm lands inside its source range — not mis-filed
    // under the foreign file (which would make the arm never match → read 0).
    const FOREIGN = '/proj/assembly/other.ts';
    const foreignExpr: ExpressionDebugInfo = { type: 'Const', isBranch: false, location: { filePath: FOREIGN, line: 99, column: 5 } };
    const di = debugInfoFor([
      func(
        [foreignExpr, expr(10, 3), expr(12, 5)], // [0] foreign, [1] home then, [2] home else
        [decisionBlock(0, 3, [], [1, 2]), block(1, 4, [0, 1]), block(2, 5, [2])],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[3] = 5; counters[4] = 2; counters[5] = 3;

    // filed under the home file (FILE), keyed by home-file arm positions
    expect(branchesOf(buildBranchHits(di, counters))).toEqual({
      '10:3|12:5': {
        decisionHits: 5,
        targets: [
          { hits: 2, location: loc(10, 3) },
          { hits: 3, location: loc(12, 5) },
        ],
      },
    });
  });

  test('arm with only foreign locations falls back to the foreign one (no home-file anchor)', () => {
    // then-arm (block 1) is purely inlined-foreign — no home-file expression to use.
    // Rather than drop the arm, fall back to the foreign location (no worse than
    // before); the decision then files under the foreign file. Documents the edge.
    const FOREIGN = '/proj/assembly/other.ts';
    const foreignThen: ExpressionDebugInfo = { type: 'Const', isBranch: false, location: { filePath: FOREIGN, line: 99, column: 5 } };
    const di = debugInfoFor([
      func(
        [foreignThen, expr(12, 5)], // [0] foreign-only then, [1] home else
        [decisionBlock(0, 3, [], [1, 2]), block(1, 4, [0]), block(2, 5, [1])],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[3] = 5; counters[4] = 2; counters[5] = 3;

    const result = buildBranchHits(di, counters);
    expect(result.hitsByFileAndDecision[FOREIGN]?.['12:5|99:5']).toEqual({
      decisionHits: 5,
      targets: [
        { hits: 2, location: { filePath: FOREIGN, line: 99, column: 5 } },
        { hits: 3, location: loc(12, 5) },
      ],
    });
  });

  test('returns empty map when there are no instrumented functions', () => {
    const di: BinaryDebugInfo = {
      debugSourceFiles: [],
      functionsByFileAndPosition: {},
      instrumentedFunctionCount: 0,
      totalInstrumentationCounters: 0,
    };
    expect(buildBranchHits(di, []).hitsByFileAndDecision).toEqual({});
  });
});

describe('buildCaseHits', () => {
  // Models a switch comparison + empty fall-through case at -O0:
  //   decision block 0 (comparison `day == <label>`): its LAST located expression is
  //   the case-label Const (3:10 discriminant precedes 4:9 case-label). Its out-edges
  //   are block 1 (next comparison, false edge) and block 2 (the empty case region).
  //   block 2 = empty fall-through case: counted (post-anchored), no located
  //   expression, single out-edge.
  test('attributes an empty case counter to its in-edge decision case-label (last located expr)', () => {
    const di = debugInfoFor([
      func(
        [expr(3, 10), expr(4, 9)],
        [
          decisionBlock(0, 9, [0, 1], [1, 2]), // comparison: case-label = last located (4:9)
          block(1, undefined, []),             // next comparison (not an empty case — no counter)
          block(2, 5, []),                     // empty fall-through case (post-anchored)
        ],
      ),
    ]);
    const counters = new Array(32).fill(0);
    counters[5] = 1; // empty case entered once

    expect(hits(buildCaseHits(di, counters))).toEqual({ '4:9': 1 });
  });

  test('reports an untested empty case as 0 (instrumented, never entered)', () => {
    const di = debugInfoFor([
      func([expr(3, 10), expr(4, 9)],
        [decisionBlock(0, 9, [0, 1], [1, 2]), block(1, undefined, []), block(2, 5, [])]),
    ]);
    const counters = new Array(32).fill(0); // counter 5 = 0

    expect(hits(buildCaseHits(di, counters))).toEqual({ '4:9': 0 });
  });

  test('ignores body-bearing case blocks (located) — only empty post-anchored blocks count', () => {
    // block 2 carries a located body expression (6:7) → not an empty case; its hits
    // are read via expressionHits/statement-entry, never here.
    const di = debugInfoFor([
      func([expr(4, 9), expr(6, 7)],
        [decisionBlock(0, 9, [0], [1, 2]), block(1, undefined, []), block(2, 5, [1])]),
    ]);
    const counters = new Array(32).fill(0);
    counters[5] = 2;

    expect(hits(buildCaseHits(di, counters))).toEqual({});
  });

  test('skips an empty case whose in-edge decision has no located expression', () => {
    const di = debugInfoFor([
      func([], [decisionBlock(0, 9, [], [1, 2]), block(1, undefined, []), block(2, 5, [])]),
    ]);
    const counters = new Array(32).fill(0);
    counters[5] = 1;

    expect(hits(buildCaseHits(di, counters))).toEqual({});
  });

  test('SUMs empty-case hits across monomorphizations of the same source switch', () => {
    const instanceA = func([expr(3, 10), expr(4, 9)],
      [decisionBlock(0, 9, [0, 1], [1, 2]), block(1, undefined, []), block(2, 5, [])], 's<i32>');
    const instanceB = func([expr(3, 10), expr(4, 9)],
      [decisionBlock(0, 10, [0, 1], [1, 2]), block(1, undefined, []), block(2, 6, [])], 's<f64>');
    const di = debugInfoFor([instanceA, instanceB], '1:1');
    const counters = new Array(32).fill(0);
    counters[5] = 1; // instance A empty case
    counters[6] = 2; // instance B empty case

    expect(hits(buildCaseHits(di, counters))).toEqual({ '4:9': 3 });
  });

  test('returns empty map when there are no instrumented functions', () => {
    const di: BinaryDebugInfo = {
      debugSourceFiles: [],
      functionsByFileAndPosition: {},
      instrumentedFunctionCount: 0,
      totalInstrumentationCounters: 0,
    };
    expect(buildCaseHits(di, []).hitCountsByFileAndPosition).toEqual({});
  });
});

describe('buildDecisionPositions', () => {
  test('emits each decision block\'s located position, per file', () => {
    // block 0 is a decision located at its condition 5:3; arms 1,2 are non-decision.
    const di = debugInfoFor([
      func(
        [expr(5, 3), expr(6, 1), expr(8, 1)],
        [decisionBlock(0, 3, [0], [1, 2]), block(1, 4, [1]), block(2, 5, [2])],
      ),
    ]);
    expect(buildDecisionPositions(di).positionsByFile[FILE]).toEqual(['5:3']);
  });

  test('skips a decision block with no located expression (fused-logical)', () => {
    const di = debugInfoFor([
      func([expr(6, 1), expr(8, 1)],
        [decisionBlock(0, undefined, [], [1, 2]), block(1, 4, [0]), block(2, 5, [1])]),
    ]);
    expect(buildDecisionPositions(di).positionsByFile).toEqual({});
  });

  test('ignores non-decision blocks', () => {
    const di = debugInfoFor([func([expr(5, 3)], [block(0, 4, [0])])]);
    expect(buildDecisionPositions(di).positionsByFile).toEqual({});
  });

  test('dedups the same decision position across monomorphizations', () => {
    const a = func([expr(5, 3), expr(6, 1)], [decisionBlock(0, 3, [0], [1]), block(1, 4, [1])], 'f<i32>');
    const b = func([expr(5, 3), expr(6, 1)], [decisionBlock(0, 5, [0], [1]), block(1, 6, [1])], 'f<f64>');
    const di = debugInfoFor([a, b], '20:1');
    expect(buildDecisionPositions(di).positionsByFile[FILE]).toEqual(['5:3']);
  });
});
