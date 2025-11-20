/**
 * Coverage Data Merge Utilities
 *
 * Functions for merging CoverageData objects and building merged coverage
 * from source debug info and accumulated execution data.
 */

import type { CoverageData, DebugInfo } from '../types.js';
import { debug } from '../utils/debug.mjs';

/**
 * Merge incoming CoverageData into accumulated CoverageData
 *
 * Combines by filepath + qualified name, summing hit counts.
 * Mutates the accumulated object in place.
 *
 * @param accumulated - Accumulated coverage data (mutated)
 * @param incoming - New coverage data to merge in
 */
export function mergeCoverageData(
  accumulated: CoverageData,
  incoming: CoverageData
): void {
  for (const [filePath, functions] of Object.entries(incoming.qualifiedFunctionsByAbsoluteFilePath)) {
    // Ensure file exists in accumulated
    if (!accumulated.qualifiedFunctionsByAbsoluteFilePath[filePath]) {
      accumulated.qualifiedFunctionsByAbsoluteFilePath[filePath] = {};
    }

    const accumulatedFunctions = accumulated.qualifiedFunctionsByAbsoluteFilePath[filePath];

    for (const [qualifiedName, funcCovInfo] of Object.entries(functions)) {
      if (accumulatedFunctions[qualifiedName]) {
        // Function exists - sum hit counts
        accumulatedFunctions[qualifiedName].hitCount += funcCovInfo.hitCount;
      } else {
        // New function - copy it
        accumulatedFunctions[qualifiedName] = {
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
 * @param accumulatedCoverageData - Accumulated execution coverage data
 * @returns CoverageData with all source functions and correct hit counts
 */
export function buildMergedCoverageData(
  sourceDebugInfo: DebugInfo,
  accumulatedCoverageData: CoverageData
): CoverageData {
  const result: CoverageData = {
    qualifiedFunctionsByAbsoluteFilePath: {}
  };

  let totalFunctions = 0;
  let functionsWithHits = 0;

  for (const [filePath, functions] of Object.entries(sourceDebugInfo.qualifiedFunctionsByAbsoluteFilePath)) {
    result.qualifiedFunctionsByAbsoluteFilePath[filePath] = {};
    const resultFunctions = result.qualifiedFunctionsByAbsoluteFilePath[filePath];

    // Get accumulated functions for this file (if any)
    const accumulatedFunctions = accumulatedCoverageData.qualifiedFunctionsByAbsoluteFilePath[filePath] ?? {};

    for (const [qualifiedName, funcInfo] of Object.entries(functions)) {
      // Look up hit count from accumulated data (pre-v1 name matching currently!)
      const accumulatedFunc = accumulatedFunctions[qualifiedName];
      const hitCount = accumulatedFunc?.hitCount ?? 0;

      resultFunctions[qualifiedName] = {
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
