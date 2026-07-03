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
  DecisionPositions,
  FunctionDebugInfo,
  SourceLocation,
} from '../types/types.js';
import { mergeBranchPathHits } from '../coverage-provider/coverage-merge.js';

/**
 * Build statement/expression-level coverage from block counters.
 *
 * Attributes each instrumented block's hit count to the source positions of the
 * located expressions it contains, applying this aggregation:
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
 * A branch arm's representative entry position: the first located expression in
 * the block that lies in the function's OWN (home) file, in expression order
 * (≈ execution order).
 *
 * The home-file preference matters because a block can contain cross-file inlined
 * expressions — most commonly a default-param `Const` inlined from another file's
 * constructor (e.g. `new Counter()` applying the default), located at the
 * constructor's definition site. That foreign location is NOT where this arm lives
 * in source; using it would file the whole decision under the foreign file and put
 * the arm outside its source range, so the arm would never containment-match and
 * would read 0. We skip foreign locations and use the first home-file one, falling
 * back to the first foreign location only when an arm has no home-file expression
 * at all (a purely-inlined arm — no worse than before). Returns undefined for a
 * block with no located expression (an implicit arm, derived provider-side).
 *
 * The home file comes from `representativeLocation`, which is guaranteed local to
 * the function (see coverage-architecture.md → Representative Location).
 */
function firstLocatedExpressionLocation(
  funcInfo: FunctionDebugInfo,
  block: BasicBlockDebugInfo,
): SourceLocation | undefined {
  const homeFile = funcInfo.representativeLocation.filePath;
  let firstForeign: SourceLocation | undefined;
  for (const exprIndex of block.expressionIndices) {
    const location = funcInfo.expressions[exprIndex]?.location;
    if (!location) {
      continue;
    }
    if (location.filePath === homeFile) {
      return location;
    }
    if (!firstForeign) {
      firstForeign = location;
    }
  }
  return firstForeign;
}

/**
 * Canonical decision key: the sorted composite of the decision's located
 * arm-target positions (e.g. "47:9|49:3"). Source-derived, so it is stable
 * across binaries and across monomorphizations of the same source branch.
 *
 * Stability across monomorphizations relies on an arm's target position coming
 * from the arm's SOURCE content, which is identical for every specialization —
 * so an arm doesn't drop from (or shift within) the key for some types only. Even
 * a type-conditionally-folded inner construct keeps a located marker at its own
 * source position (a folded `if (isInteger<T>()) {…}` still anchors the arm at the
 * inner `if`), so a surviving decision's arms stay located in every instance and
 * the per-instance keys match and merge.
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

/**
 * The last located expression in a block that lies in the function's OWN (home)
 * file, in expression (≈ execution) order — falling back to the last foreign
 * location only when the block has no home-file expression at all. Returns
 * undefined for a block with no located expressions.
 *
 * The home-file preference mirrors firstLocatedExpressionLocation (see its doc for
 * the cross-file inlining rationale): a foreign location would file the result
 * under the wrong file. The home file comes from `representativeLocation`, which
 * is guaranteed local to the function.
 *
 * Because straight-line code shares a basic block with the branch that terminates
 * it, a block's LAST located expression is the one nearest the branch — for a
 * switch comparison decision (`day == <case-label>`) the case-label `Const` (the
 * eq/br_if that follow carry no location), and for an `if`/ternary/logical
 * decision the condition itself.
 */
function lastLocatedExpressionLocation(
  funcInfo: FunctionDebugInfo,
  block: BasicBlockDebugInfo,
): SourceLocation | undefined {
  const homeFile = funcInfo.representativeLocation.filePath;
  let lastForeign: SourceLocation | undefined;
  for (let i = block.expressionIndices.length - 1; i >= 0; i--) {
    const location = funcInfo.expressions[block.expressionIndices[i]!]?.location;
    if (!location) {
      continue;
    }
    if (location.filePath === homeFile) {
      return location;
    }
    if (!lastForeign) {
      lastForeign = location;
    }
  }
  return lastForeign;
}

/**
 * The decision block that branches into the given block (its in-edge). For an
 * empty fall-through switch case, this is the comparison decision whose matched
 * (true) edge targets the empty case region. Returns the first decision whose
 * out-edges include the target index.
 */
function findInEdgeDecision(
  funcInfo: FunctionDebugInfo,
  targetBlockIndex: number,
): BasicBlockDebugInfo | undefined {
  for (const block of funcInfo.basicBlocks) {
    if (!block.isDecision) {
      continue;
    }
    for (const edge of block.branches) {
      if (edge.targetBlockIndex === targetBlockIndex) {
        return block;
      }
    }
  }
  return undefined;
}

/**
 * Build empty fall-through switch-case coverage from post-anchored block counters.
 *
 * An empty fall-through case (`case A: case B: <body>`, where `case A` has no
 * statements of its own) carries its "entered" count on a post-anchored block —
 * one with a counter but NO located expression, so it is invisible to both
 * buildExpressionHits and buildBranchHits. Here we surface it: for each such block
 * (counted, no located expression, not a decision), find its in-edge decision (the
 * comparison block that branches into it) and borrow that decision's case-label
 * position (its last located expression — the `case X:` literal), recording
 * `{caseLabelPosition: counter}`.
 *
 * This goes in a DEDICATED map rather than expressionHits/branchHits because the
 * case-label position is already occupied in BOTH shared maps — by the comparison
 * block's own case-label `Const` (expressionHits) and by the previous comparison's
 * false-edge arm (branchHits) — each carrying the wrong comparison-chain count. The
 * dedicated map holds only empty-case entries, so it is collision-free.
 *
 * Cross-test / cross-monomorphization SUM is applied later by merging up the suite
 * tree (mergeCoverageData). There is at most one empty-case entry per case-label
 * per function instance, so no within-instance aggregation is needed.
 *
 * @param debugInfo - processed binary debug info
 * @param counters - coverage counter values, indexed by coverageMemoryIndex
 * @returns positional empty-case hit map (CoverageData shape, keyed by case-label position)
 */
export function buildCaseHits(
  debugInfo: BinaryDebugInfo,
  counters: ArrayLike<number>,
): CoverageData {
  const caseHits: CoverageData = { hitCountsByFileAndPosition: {} };

  for (const debugFunctions of Object.values(debugInfo.functionsByFileAndPosition)) {
    for (const funcInfos of Object.values(debugFunctions)) {
      for (const funcInfo of funcInfos) {
        for (const block of funcInfo.basicBlocks) {
          // Only the addon's post-anchored empty fall-through switch cases feed
          // emptyCaseHits — the flag identifies them by construction, so no structural
          // inference here. (A post-anchored block always has a counter; the index
          // check just narrows the type for the read below.)
          if (!block.isPostAnchored || block.coverageMemoryIndex === undefined) {
            continue;
          }

          const inEdgeDecision = findInEdgeDecision(funcInfo, block.index);
          if (!inEdgeDecision) {
            continue;
          }
          const location = lastLocatedExpressionLocation(funcInfo, inEdgeDecision);
          if (!location) {
            continue;
          }

          const hits = counters[block.coverageMemoryIndex] ?? 0;
          const positionKey = `${location.line}:${location.column}`;
          const fileHits = (caseHits.hitCountsByFileAndPosition[location.filePath] ??= {});
          fileHits[positionKey] = (fileHits[positionKey] ?? 0) + hits;
        }
      }
    }
  }

  return caseHits;
}

/**
 * Build the set of binary decision-block source positions, per file — the robust
 * signal for detecting compiler-folded branches.
 *
 * For every decision block (CFG out-degree ≥ 2), record its representative source
 * position: the home-file-aware LAST located expression — the expression nearest
 * the branch, i.e. the condition itself. It must be the last, not the first:
 * straight-line statements preceding a branch construct share its basic block, so
 * the block's first located expression can belong to a statement BEFORE the
 * construct — recording that position made such a branch undetectable within its
 * condition range and mis-classified it as folded (reporting a taken implicit
 * else as untaken).
 *
 * A source branch whose condition range contains NONE of these positions was
 * folded: a constant condition is evaluated at compile time and emits no decision
 * block. Unlike "no arm matched", this can't be confused with a real branch whose
 * empty/unlocated arms got its decision dropped from branchHits.
 *
 * Purely structural — independent of execution (no counters). Deduplicated per file;
 * accumulated by UNION across tests and files (mergeDecisionPositions).
 *
 * @param debugInfo - processed binary debug info
 * @returns decision positions keyed by file ("line:column")
 */
export function buildDecisionPositions(debugInfo: BinaryDebugInfo): DecisionPositions {
  const sets: Record<string, Set<string>> = {};

  for (const debugFunctions of Object.values(debugInfo.functionsByFileAndPosition)) {
    for (const funcInfos of Object.values(debugFunctions)) {
      for (const funcInfo of funcInfos) {
        for (const block of funcInfo.basicBlocks) {
          if (!block.isDecision) {
            continue;
          }
          const location = lastLocatedExpressionLocation(funcInfo, block);
          if (!location) {
            continue;
          }
          (sets[location.filePath] ??= new Set()).add(`${location.line}:${location.column}`);
        }
      }
    }
  }

  const positionsByFile: Record<string, string[]> = {};
  for (const [filePath, set] of Object.entries(sets)) {
    positionsByFile[filePath] = [...set];
  }
  return { positionsByFile };
}
