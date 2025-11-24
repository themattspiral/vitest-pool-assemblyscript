/**
 * Coverage Data Merge Utilities
 *
 * Functions for merging CoverageData objects and building merged coverage
 * from source debug info and accumulated execution data.
 */

import type { CoverageData, DebugInfo, FunctionCoverageInfo } from '../types.js';
import { debug } from '../utils/debug.mjs';

/**
 * Merge incoming CoverageData into accumulated CoverageData
 *
 * Combines by filepath + position, summing hit counts.
 * Mutates the accumulated object in place.
 *
 * @param accumulated - Accumulated coverage data (mutated)
 * @param incoming - New coverage data to merge in
 */
export function mergeCoverageData(
  accumulated: CoverageData,
  incoming: CoverageData
): void {
  for (const [filePath, positions] of Object.entries(incoming.positionCoverageByAbsoluteFilePath)) {
    // Ensure file exists in accumulated
    if (!accumulated.positionCoverageByAbsoluteFilePath[filePath]) {
      accumulated.positionCoverageByAbsoluteFilePath[filePath] = {};
    }

    const accumulatedPositions = accumulated.positionCoverageByAbsoluteFilePath[filePath];

    for (const [positionKey, funcCovInfo] of Object.entries(positions)) {
      if (accumulatedPositions[positionKey]) {
        // Position exists - sum hit counts
        accumulatedPositions[positionKey].hitCount += funcCovInfo.hitCount;
      } else {
        // New position - copy it
        accumulatedPositions[positionKey] = {
          info: { ...funcCovInfo.info },
          hitCount: funcCovInfo.hitCount
        };
      }
    }
  }
}

/**
 * Build merged CoverageData from source debug info and accumulated coverage
 *
 * Creates CoverageData containing ALL functions from sourceDebugInfo,
 * with hit counts from accumulatedCoverageData where available (else 0).
 *
 * This ensures the final Istanbul format includes all source functions,
 * not just executed ones, preventing false 100% coverage reports.
 *
 * @param sourceDebugInfo - All functions from parsed source files (source of truth for line numbers)
 * @param accumulatedCoverageData - Accumulated execution coverage data (keyed by position)
 * @returns CoverageData with all source functions and correct hit counts
 */
export function buildMergedCoverageData(
  sourceDebugInfo: DebugInfo,
  accumulatedCoverageData: CoverageData
): CoverageData {
  const result: CoverageData = {
    positionCoverageByAbsoluteFilePath: {}
  };

  let totalFunctions = 0;
  let functionsWithHits = 0;

  for (const [filePath, functions] of Object.entries(sourceDebugInfo.qualifiedFunctionsByAbsoluteFilePath)) {
    result.positionCoverageByAbsoluteFilePath[filePath] = {};
    const resultPositions = result.positionCoverageByAbsoluteFilePath[filePath];

    // Get accumulated coverage for this file (if any) - position-keyed
    const accumulatedPositions = accumulatedCoverageData.positionCoverageByAbsoluteFilePath[filePath] ?? {};

    // Build reverse index: qualified name -> FunctionCoverageInfo
    // This allows name-based matching even though accumulated data is position-keyed
    const accumulatedByName: Record<string, FunctionCoverageInfo> = {};
    for (const funcCovInfo of Object.values(accumulatedPositions)) {
      accumulatedByName[funcCovInfo.info.qualifiedName] = funcCovInfo;
    }

    for (const [qualifiedName, funcInfo] of Object.entries(functions)) {
      // Look up hit count by qualified name (v1: exact match, v2: will use containment matching)
      const accumulatedFunc = accumulatedByName[qualifiedName];
      const hitCount = accumulatedFunc?.hitCount ?? 0;

      // Output using source position as key
      const positionKey = `${funcInfo.startLine}:${funcInfo.startColumn}`;
      resultPositions[positionKey] = {
        info: funcInfo,
        hitCount
      };

      totalFunctions++;
      if (hitCount > 0) {
        functionsWithHits++;
      }
    }
  }

  debug(`[CoverageMerge] Built merged coverage: ${functionsWithHits}/${totalFunctions} functions with hits`);

  return result;
}
