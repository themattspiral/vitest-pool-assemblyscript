/**
 * Executor-side coverage extraction
 *
 * Converts raw WASM coverage counters into positional coverage data, run per
 * test in the test worker (where the binary's debug info is in hand).
 */

import type {
  BasicBlockDebugInfo,
  BinaryDebugInfo,
  BranchHits,
  BranchTargetHits,
  CoverageData,
  FunctionDebugInfo,
  SourceLocation,
} from '../types/types.js';
import { mergeBranchPathHits } from '../coverage-provider/coverage-merge.js';

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

/**
 * The first located expression in a block, in expression order (≈ execution
 * order). Used as a branch arm's representative entry position — guaranteed to
 * fall inside the arm's source range, so it containment-matches to the source
 * arm during conversion. Returns undefined for an unlocated block (an implicit
 * arm, whose hits are derived provider-side, not counted here).
 */
function firstLocatedExpressionLocation(
  funcInfo: FunctionDebugInfo,
  block: BasicBlockDebugInfo,
): SourceLocation | undefined {
  for (const exprIndex of block.expressionIndices) {
    const location = funcInfo.expressions[exprIndex]?.location;
    if (location) {
      return location;
    }
  }
  return undefined;
}

/**
 * Canonical decision key: the sorted composite of the decision's located
 * arm-target positions (e.g. "47:9|49:3"). Source-derived, so it is stable
 * across binaries and across monomorphizations of the same source branch.
 */
function buildDecisionKey(targets: BranchTargetHits[]): string {
  return targets
    .map(t => `${t.location.line}:${t.location.column}`)
    .sort()
    .join('|');
}

/**
 * Build branch-level coverage from block counters.
 *
 * For each decision block (CFG out-degree ≥ 2), records per-arm hit counts — the
 * counter of each located out-edge target block — plus the decision's own hit
 * count (`decisionHits`):
 *   - `decisionHits` = the decision block's counter, or `null` when the decision
 *     block has no counter (a fused-logical `if`/loop/ternary whose condition is
 *     a synthetic `&&`/`||` result, with no located expression to anchor on). The
 *     provider derives a null decisionHits from the condition's leftmost-atom hit.
 *   - `targets` carries only LOCATED out-edge targets (arms with source code).
 *     Unlocated targets (implicit else/default arms) are omitted; the provider
 *     derives their hits as decisionHits − Σ(located arm hits).
 *
 * Decisions are keyed by their located arm-target positions, so the same source
 * branch across monomorphizations resolves to one key and its arm hits SUM. The
 * cross-test SUM is applied later by merging these per-test results up the suite
 * tree (mergeBranchHits).
 *
 * @param debugInfo - processed binary debug info
 * @param counters - coverage counter values, indexed by coverageMemoryIndex
 * @returns branch hit map keyed by file + decision key
 */
export function buildBranchHits(
  debugInfo: BinaryDebugInfo,
  counters: ArrayLike<number>,
): BranchHits {
  const branchHits: BranchHits = { hitsByFileAndDecision: {} };

  for (const debugFunctions of Object.values(debugInfo.functionsByFileAndPosition)) {
    for (const funcInfos of Object.values(debugFunctions)) {
      for (const funcInfo of funcInfos) {
        // Index blocks by their CFG index so out-edges can resolve target blocks.
        const blockByIndex = new Map<number, BasicBlockDebugInfo>();
        for (const block of funcInfo.basicBlocks) {
          blockByIndex.set(block.index, block);
        }

        for (const block of funcInfo.basicBlocks) {
          if (!block.isDecision) {
            continue;
          }

          // Located arm targets: each out-edge target block's first located
          // expression position + its counter value.
          const targets: BranchTargetHits[] = [];
          for (const edge of block.branches) {
            const targetBlock = blockByIndex.get(edge.targetBlockIndex);
            if (!targetBlock) {
              continue;
            }
            const location = firstLocatedExpressionLocation(funcInfo, targetBlock);
            if (!location) {
              continue; // unlocated arm — implicit, derived provider-side
            }
            const hits = targetBlock.coverageMemoryIndex === undefined
              ? 0
              : (counters[targetBlock.coverageMemoryIndex] ?? 0);
            targets.push({ hits, location });
          }

          // A decision with no located arms is unmatchable to a source branch
          // (both arms implicit) — nothing to report.
          if (targets.length === 0) {
            continue;
          }

          const decisionHits = block.coverageMemoryIndex === undefined
            ? null
            : (counters[block.coverageMemoryIndex] ?? 0);

          const decisionKey = buildDecisionKey(targets);
          const filePath = targets[0]!.location.filePath;
          const fileDecisions = (branchHits.hitsByFileAndDecision[filePath] ??= {});

          const existing = fileDecisions[decisionKey];
          if (existing) {
            // SUM across monomorphizations of the same source branch.
            mergeBranchPathHits(existing, { decisionHits, targets });
          } else {
            fileDecisions[decisionKey] = { decisionHits, targets };
          }
        }
      }
    }
  }

  return branchHits;
}
