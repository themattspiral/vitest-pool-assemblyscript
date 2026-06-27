/**
 * Coverage Data Merge Utilities
 *
 * Functions for merging CoverageData and BranchHits objects
 */

import type { BranchHits, BranchPathHits, CoverageBundle, CoverageData, DecisionPositions } from '../types/types.js';

/**
 * Merge incoming CoverageData into accumulated CoverageData
 *
 * Combines by filepath + position, summing hit counts. This is PER-POSITION
 * aggregation — it sums the same source position across tests (up the suite tree)
 * and across binaries (in the provider). The separate PER-FUNCTION roll-up (combining
 * the positions that map into one source function) happens later, at Istanbul
 * conversion — see convertToIstanbulFormat. Mutates the accumulated object in place.
 *
 * @param accumulated - Accumulated coverage data (mutated)
 * @param incoming - New coverage data to merge in
 */
export function mergeCoverageData(
  accumulated: CoverageData,
  incoming: CoverageData
): void {
  for (const [filePath, positions] of Object.entries(incoming.hitCountsByFileAndPosition)) {
    // Ensure file exists in accumulated
    if (!accumulated.hitCountsByFileAndPosition[filePath]) {
      accumulated.hitCountsByFileAndPosition[filePath] = {};
    }

    const accumulatedPositions = accumulated.hitCountsByFileAndPosition[filePath];

    for (const [positionKey, hitCount] of Object.entries(positions)) {
      if (accumulatedPositions[positionKey] !== undefined) {
        // Position exists - sum hit counts
        accumulatedPositions[positionKey] += hitCount;
      } else {
        // New position - set hit count
        accumulatedPositions[positionKey] = hitCount;
      }
    }
  }
}

/**
 * Position key ("line:column") for a branch arm target, used to merge arm hit
 * counts by source position rather than by array index (edge order is not stable
 * across instances).
 */
function targetPositionKey(target: BranchPathHits['targets'][number]): string {
  return `${target.location.line}:${target.location.column}`;
}

/**
 * Merge one BranchPathHits (a single decision's hits) into an accumulated one.
 *
 * - decisionHits: a decision either always carries a counter or never does (a
 *   property of how its source construct lowers, identical across instances and
 *   tests), so `null` (binary-unmeasurable, derived provider-side) stays `null`;
 *   otherwise SUM.
 * - targets: matched by source position (not array index) and SUMmed; new arm
 *   positions are appended. (A located arm seen in one instance/test but not
 *   another simply carries through.)
 *
 * Mutates `accumulated` in place.
 */
export function mergeBranchPathHits(
  accumulated: BranchPathHits,
  incoming: BranchPathHits
): void {
  if (accumulated.decisionHits === null || incoming.decisionHits === null) {
    accumulated.decisionHits = null;
  } else {
    accumulated.decisionHits += incoming.decisionHits;
  }

  for (const incomingTarget of incoming.targets) {
    const key = targetPositionKey(incomingTarget);
    const existing = accumulated.targets.find(t => targetPositionKey(t) === key);
    if (existing) {
      existing.hits += incomingTarget.hits;
    } else {
      accumulated.targets.push({ hits: incomingTarget.hits, location: incomingTarget.location });
    }
  }
}

/**
 * Merge incoming BranchHits into accumulated BranchHits.
 *
 * Combines by file path + decision key, summing arm hits and decisionHits via
 * mergeBranchPathHits. Mutates the accumulated object in place. Used both to
 * accumulate per-test branch hits up the suite tree and across files in the
 * provider.
 *
 * @param accumulated - Accumulated branch hits (mutated)
 * @param incoming - New branch hits to merge in
 */
export function mergeBranchHits(
  accumulated: BranchHits,
  incoming: BranchHits
): void {
  for (const [filePath, decisions] of Object.entries(incoming.hitsByFileAndDecision)) {
    const accumulatedDecisions = (accumulated.hitsByFileAndDecision[filePath] ??= {});

    for (const [decisionKey, pathHits] of Object.entries(decisions)) {
      const existing = accumulatedDecisions[decisionKey];
      if (existing) {
        mergeBranchPathHits(existing, pathHits);
      } else {
        // Copy so the accumulated object never aliases the incoming payload.
        accumulatedDecisions[decisionKey] = {
          decisionHits: pathHits.decisionHits,
          targets: pathHits.targets.map(t => ({ hits: t.hits, location: t.location })),
        };
      }
    }
  }
}

/**
 * Merge incoming DecisionPositions into accumulated, by UNION per file (dedup).
 *
 * Decision positions are structural — a decision block exists regardless of
 * execution and is identical across a file's tests — so the merge is a set union,
 * not a sum. Used both up the suite tree and across files in the provider. Mutates
 * `accumulated` in place.
 */
export function mergeDecisionPositions(
  accumulated: DecisionPositions,
  incoming: DecisionPositions
): void {
  for (const [filePath, positions] of Object.entries(incoming.positionsByFile)) {
    const existing = (accumulated.positionsByFile[filePath] ??= []);
    const seen = new Set(existing);
    for (const position of positions) {
      if (!seen.has(position)) {
        seen.add(position);
        existing.push(position);
      }
    }
  }
}

/**
 * Create an empty CoverageBundle (all sub-structures initialized empty).
 *
 * Used to seed a suite's accumulated coverage before merging in its children.
 */
export function emptyCoverageBundle(): CoverageBundle {
  return {
    functionHits: { hitCountsByFileAndPosition: {} },
    expressionHits: { hitCountsByFileAndPosition: {} },
    branchHits: { hitsByFileAndDecision: {} },
    emptyCaseHits: { hitCountsByFileAndPosition: {} },
    decisionPositions: { positionsByFile: {} },
  };
}

/**
 * Merge an incoming CoverageBundle into an accumulated one, applying each field's
 * own merge strategy: SUM for the position-keyed count maps (function/expression/
 * empty-case hits), branch-merge for branchHits, and UNION for decisionPositions.
 * Mutates the accumulated bundle in place.
 *
 * @param accumulated - Accumulated coverage bundle (mutated)
 * @param incoming - New coverage bundle to merge in
 */
export function mergeCoverageBundle(
  accumulated: CoverageBundle,
  incoming: CoverageBundle
): void {
  mergeCoverageData(accumulated.functionHits, incoming.functionHits);
  mergeCoverageData(accumulated.expressionHits, incoming.expressionHits);
  mergeBranchHits(accumulated.branchHits, incoming.branchHits);
  mergeCoverageData(accumulated.emptyCaseHits, incoming.emptyCaseHits);
  mergeDecisionPositions(accumulated.decisionPositions, incoming.decisionPositions);
}
