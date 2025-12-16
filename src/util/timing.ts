/**
 * Timing utilities for performance tracking
 */

import type { PhaseTimings } from '../types.js';

/**
 * Create phase timings tracker
 *
 * @returns PhaseTimings object with phaseStart set to current time
 */
export function createPhaseTimings(): PhaseTimings {
  return {
    phaseStart: performance.now(),
    phaseEnd: 0,
  };
}
