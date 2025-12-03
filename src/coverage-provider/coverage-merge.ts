/**
 * Coverage Data Merge Utilities
 *
 * Functions for merging CoverageData objects
 */

import type { CoverageData } from '../types.js';

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
