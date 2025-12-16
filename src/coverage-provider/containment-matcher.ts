/**
 * Containment Matcher
 *
 * Provides containment-based matching for coverage mapping.
 * Binary debug info provides points (representativeLocation), source parsing provides ranges.
 * We find which source range contains each binary point.
 *
 * Usage by version:
 * - v1: Function containment matching (binary representativeLocation → source function range)
 * - v2: Function containment (same) + statement containment + branch path containment
 *
 * Why containment matching (not direct position lookup):
 * AS compiler generates source map entries differently by statement type:
 * - Variable declarations: source map points to statement start (keyword)
 * - Control flow (if/switch/for): source map points to condition EXPRESSION, not keyword
 *
 * Example: `if (n < 0)` → binary reports column 7 ('n'), not column 3 ('i' of 'if')
 *
 * Containment matching is more robust:
 * - Binary gives us a position (representativeLocation) somewhere in the function
 * - Source gives us function ranges (start/end line/column)
 * - We find which source function range contains the binary position
 * - Handles nested functions with "tightest fit" (innermost function wins)
 */

import type { ParsedSourceFunctionInfo, SourceRange } from '../types/types.js';

/**
 * Functions indexed by file path, then by start line.
 * Multiple functions can start on the same line (e.g., nested arrow functions).
 */
export type FunctionsByFileAndStartLine = Record<string, Record<number, ParsedSourceFunctionInfo[]>>;

/**
 * Find the source function whose range contains the given position.
 *
 * For nested functions, uses "tightest fit" - returns the innermost function
 * (the one with the largest start position among all containing functions).
 *
 * @param functionsByStartLine - Functions for a single file, indexed by start line
 * @param line - Target line number (1-based)
 * @param column - Target column number (1-based)
 * @returns The containing function, or undefined if no match
 */
export function findFunctionContainingPosition(
  functionsByStartLine: Record<number, ParsedSourceFunctionInfo[]>,
  line: number,
  column: number
): ParsedSourceFunctionInfo | undefined {
  let bestMatch: ParsedSourceFunctionInfo | undefined;
  let bestStartLine = -1;
  let bestStartColumn = -1;

  // Check functions starting on lines <= target line
  for (const [startLineStr, functions] of Object.entries(functionsByStartLine)) {
    const startLine = Number(startLineStr);
    if (startLine > line) continue;

    for (const func of functions) {
      const { range } = func;

      // Check if position is within this function's range
      if (!isPositionInRange(line, column, range)) continue;

      // Tightest fit: prefer function with largest start position (innermost)
      if (startLine > bestStartLine ||
          (startLine === bestStartLine && range.startColumn > bestStartColumn)) {
        bestMatch = func;
        bestStartLine = startLine;
        bestStartColumn = range.startColumn;
      }
    }
  }

  return bestMatch;
}

/**
 * Check if a position (line, column) falls within a source range.
 *
 * @param line - Target line number (1-based)
 * @param column - Target column number (1-based)
 * @param range - Source range to check against
 * @returns true if position is within range (inclusive)
 */
export function isPositionInRange(
  line: number,
  column: number,
  range: SourceRange
): boolean {
  // Outside line range entirely
  if (line < range.startLine || line > range.endLine) return false;

  // On start line but before start column
  if (line === range.startLine && column < range.startColumn) return false;

  // On end line but after end column
  if (line === range.endLine && column > range.endColumn) return false;

  return true;
}
