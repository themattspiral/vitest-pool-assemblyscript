import { describe, test, expect } from 'vitest';

import { buildExpressionHits } from '../../src/wasm-executor/coverage-extraction.js';
import type {
  BinaryDebugInfo,
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
