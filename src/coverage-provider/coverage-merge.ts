/**
 * Coverage Data Merge Utilities
 *
 * Functions for merging CoverageData objects (hit counts only).
 * Function metadata comes from ParsedSourceInfo, not CoverageData.
 *
 * Uses direct position-based lookup for matching source functions to
 * accumulated coverage (both are keyed by first-expression position).
 */

import { relative, resolve } from 'node:path';
import type { CoverageData, ParsedSourceInfo } from '../types.js';
import { debug } from '../utils/debug.mjs';

// resolve the correct root - this file is built to dist/coverage-provider
const PROJECT_ROOT = resolve(import.meta.dirname, '../..');

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
 * Build merged CoverageData from parsed source info and accumulated coverage
 *
 * Creates CoverageData containing ALL source function positions,
 * with hit counts from accumulatedCoverageData where available (else 0).
 *
 * This ensures the final coverage includes all source functions,
 * not just executed ones, preventing false 100% coverage reports.
 *
 * Uses direct position-based lookup: both source functions and accumulated
 * coverage are keyed by first-expression position (line:column).
 *
 * @param parsedSourceInfo - All functions from parsed source files (keyed by first-expression position)
 * @param accumulatedCoverageData - Accumulated execution coverage data (keyed by position)
 * @returns CoverageData with all source function positions and correct hit counts
 */
export function buildMergedCoverageData(
  parsedSourceInfo: ParsedSourceInfo,
  accumulatedCoverageData: CoverageData
): CoverageData {
  const result: CoverageData = {
    hitCountsByFileAndPosition: {}
  };

  let totalFunctions = 0;
  let functionsWithHits = 0;

  for (const [filePath, functions] of Object.entries(parsedSourceInfo.functionsByFileAndPosition)) {
    // the resulting CoverageData is keyed by absolute path to pass to istanbul, to match JS reporting format
    result.hitCountsByFileAndPosition[filePath] = {};
    const resultPositions = result.hitCountsByFileAndPosition[filePath];
    
    // Get accumulated coverage for this file (if any) - position-keyed
    const relativeFilePath = relative(PROJECT_ROOT, filePath);  // lookup file records with relative path
    const accumulatedPositions = accumulatedCoverageData.hitCountsByFileAndPosition[relativeFilePath] ?? {};

    for (const positionKey of Object.keys(functions)) {
      // Direct position-based lookup - both source and accumulated use same key format
      const hitCount = accumulatedPositions[positionKey] ?? 0;

      resultPositions[positionKey] = hitCount;

      totalFunctions++;
      if (hitCount > 0) {
        functionsWithHits++;
      }
    }
  }

  debug(`[CoverageMerge] Built merged coverage: ${functionsWithHits}/${totalFunctions} functions with hits`);

  return result;
}
