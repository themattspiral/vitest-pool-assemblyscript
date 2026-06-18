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
 * Find the source function whose range contains the given position.
 *
 * For nested functions, uses "tightest fit" - returns the innermost function
 * (the one with the largest start position among all containing functions).
 *
 * @param fileFunctionsByLineSpan - Functions for a single file, indexed by every line they span
 * @param line - Target line number (1-based)
 * @param column - Target column number (1-based)
 * @returns The containing function, or undefined if no match
 */
export function findFunctionContainingPosition(
  fileFunctionsByLineSpan: Record<number, ParsedSourceFunctionInfo[]>,
  line: number,
  column: number
): ParsedSourceFunctionInfo | undefined {
  let bestMatch: ParsedSourceFunctionInfo | undefined;
  let bestStartLine = -1;
  let bestStartColumn = -1;

  for (const func of fileFunctionsByLineSpan[line] ?? []) {
    const { range } = func;

    // Check if position is within this function's range
    if (!isPositionInRange(line, column, range)) continue;

    // Tightest fit: prefer function with largest start position (innermost)
    if (range.startLine > bestStartLine ||
        (range.startLine === bestStartLine && range.startColumn > bestStartColumn)) {
      bestMatch = func;
      bestStartLine = range.startLine;
      bestStartColumn = range.startColumn;
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

/**
 * A binary hit position's column + count on a given line (bucketed for statement matching).
 */
export interface LineHit {
  column: number;
  count: number;
}

/**
 * Bucket file hit positions ("line:column" → count) by line, so statement
 * entry-position lookups can scan only the lines a statement spans. Built once
 * per file (transient — never crosses the RPC boundary).
 */
export function buildHitsByLine(fileHitsByPosition: Record<string, number>): Map<number, LineHit[]> {
  const hitsByLine = new Map<number, LineHit[]>();

  for (const [positionKey, count] of Object.entries(fileHitsByPosition)) {
    const colonIndex = positionKey.indexOf(':');
    if (colonIndex < 0) continue;

    const line = parseInt(positionKey.slice(0, colonIndex), 10);
    const column = parseInt(positionKey.slice(colonIndex + 1), 10);
    if (Number.isNaN(line) || Number.isNaN(column)) continue;

    const bucket = hitsByLine.get(line);
    if (bucket) {
      bucket.push({ column, count });
    } else {
      hitsByLine.set(line, [{ column, count }]);
    }
  }

  return hitsByLine;
}

/**
 * A statement's hit count = the count at its ENTRY: the smallest-position hit
 * within the statement's range (D11). The entry expression sits at the
 * statement's start, so the first line of the range that carries an in-range hit
 * holds the entry (its smallest-column in-range hit). For a compound statement
 * (if/loop), the body's hits sit at larger positions on later lines, so this
 * never picks up the hotter body — avoiding the max-over-range error.
 *
 * Returns 0 when no hit falls within the range (an uncovered located statement).
 */
export function findStatementEntryHitCount(
  hitsByLine: Map<number, LineHit[]>,
  range: SourceRange
): number {
  for (let line = range.startLine; line <= range.endLine; line++) {
    const lineHits = hitsByLine.get(line);
    if (!lineHits) continue;

    let entryColumn = Infinity;
    let entryCount = 0;
    let found = false;
    for (const { column, count } of lineHits) {
      if (!isPositionInRange(line, column, range)) continue;
      if (column < entryColumn) {
        entryColumn = column;
        entryCount = count;
        found = true;
      }
    }

    // The first range line carrying an in-range hit holds the entry expression.
    if (found) return entryCount;
  }

  return 0;
}
