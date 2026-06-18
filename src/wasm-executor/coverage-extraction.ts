/**
 * Executor-side coverage extraction
 *
 * Converts raw WASM coverage counters into positional coverage data, run per
 * test in the test worker (where the binary's debug info is in hand).
 */

import type { BinaryDebugInfo, CoverageData } from '../types/types.js';

/**
 * Build statement/expression-level coverage from block counters.
 *
 * Attributes each instrumented block's hit count to the source positions of the
 * located expressions it contains, applying D5 aggregation:
 *   - within one function instance: a source position's hit count is the MAX
 *     over the blocks at that position. One source position can land in two
 *     blocks of a single instance (compiler-split blocks, or a dead trailing
 *     `Unreachable` carrying the last real statement's location); since the
 *     count means "times the position was reached," summing would double-count
 *     one logical execution, so we take the max.
 *   - across monomorphizations of the same source function (distinct compiled
 *     functions sharing a source position): SUM — each is a real execution.
 *
 * Cross-test SUM is applied later by merging these per-test results up the suite
 * tree. Applying the per-instance MAX per test *first* is what keeps the counts
 * exact: MAX-of-summed-counters would understate a position hit by two reachable
 * blocks across different tests.
 *
 * @param debugInfo - processed binary debug info (functions grouped by file + position)
 * @param counters - coverage counter values, indexed by coverageMemoryIndex
 * @returns positional statement/expression hit map (CoverageData shape)
 */
export function buildExpressionHits(
  debugInfo: BinaryDebugInfo,
  counters: ArrayLike<number>,
): CoverageData {
  const expressionHits: CoverageData = { hitCountsByFileAndPosition: {} };

  for (const debugFunctions of Object.values(debugInfo.functionsByFileAndPosition)) {
    for (const funcInfos of Object.values(debugFunctions)) {
      for (const funcInfo of funcInfos) {
        // Per-instance: source position -> MAX block hit count
        const instanceHits: Record<string, Record<string, number>> = {};
        for (const block of funcInfo.basicBlocks) {
          if (block.coverageMemoryIndex === undefined) {
            continue;
          }
          const blockHit = counters[block.coverageMemoryIndex] ?? 0;
          for (const exprIndex of block.expressionIndices) {
            const location = funcInfo.expressions[exprIndex]?.location;
            if (!location) {
              continue;
            }
            const positionKey = `${location.line}:${location.column}`;
            const fileHits = (instanceHits[location.filePath] ??= {});
            fileHits[positionKey] = Math.max(fileHits[positionKey] ?? 0, blockHit);
          }
        }
        // SUM this instance into the result (across monomorphizations)
        for (const [filePath, positions] of Object.entries(instanceHits)) {
          const accFile = (expressionHits.hitCountsByFileAndPosition[filePath] ??= {});
          for (const [positionKey, hit] of Object.entries(positions)) {
            accFile[positionKey] = (accFile[positionKey] ?? 0) + hit;
          }
        }
      }
    }
  }

  return expressionHits;
}
