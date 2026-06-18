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

import type { BranchPathHits, ParsedSourceBranchInfo, ParsedSourceFunctionInfo, SourceRange } from '../types/types.js';

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

/**
 * A branch arm's column + hit count on a line, plus the decision it belongs to
 * (decision key + that decision's evaluation count). Bucketed by line so source
 * arm matching can scan only the lines a source arm range spans.
 */
export interface ArmHit {
  column: number;
  armHits: number;
  decisionKey: string;
  /** The owning decision's evaluation count, or null when its block is uncounted (fused-logical). */
  decisionHits: number | null;
}

/**
 * Bucket a file's branch arm-target locations by line, from the accumulated
 * branch hits. Built once per file (transient — never crosses the RPC boundary).
 */
export function buildArmsByLine(fileBranchHits: Record<string, BranchPathHits>): Map<number, ArmHit[]> {
  const armsByLine = new Map<number, ArmHit[]>();

  for (const [decisionKey, pathHits] of Object.entries(fileBranchHits)) {
    for (const target of pathHits.targets) {
      const { line, column } = target.location;
      const arm: ArmHit = { column, armHits: target.hits, decisionKey, decisionHits: pathHits.decisionHits };

      const bucket = armsByLine.get(line);
      if (bucket) {
        bucket.push(arm);
      } else {
        armsByLine.set(line, [arm]);
      }
    }
  }

  return armsByLine;
}

/**
 * Find the branch arm at the ENTRY of a source arm range — the smallest-position
 * arm location within it. Mirrors findStatementEntryHitCount: an arm's own entry
 * is its smallest in-range position, while a nested branch's arms sit at larger
 * positions (deeper in / on later lines), so this isolates the arm belonging to
 * THIS source path rather than a nested branch's arm.
 *
 * Returns undefined when no arm location falls within the range (an implicit or
 * unlocated arm — hits are derived by the caller, not matched here).
 */
export function findArmAtRangeEntry(
  armsByLine: Map<number, ArmHit[]>,
  range: SourceRange
): ArmHit | undefined {
  for (let line = range.startLine; line <= range.endLine; line++) {
    const lineArms = armsByLine.get(line);
    if (!lineArms) continue;

    let entryColumn = Infinity;
    let entryArm: ArmHit | undefined;
    for (const arm of lineArms) {
      if (!isPositionInRange(line, arm.column, range)) continue;
      if (arm.column < entryColumn) {
        entryColumn = arm.column;
        entryArm = arm;
      }
    }

    // The first range line carrying an in-range arm holds this path's entry arm.
    if (entryArm) return entryArm;
  }

  return undefined;
}

/**
 * Compute Istanbul per-path hit counts for one source branch (D4 + D9).
 *
 * - **binary-expr** (logical `&&`/`||`): Istanbul reports `[leftEvaluated,
 *   rightEvaluated]`. The left operand is evaluated whenever the operator is
 *   reached, so its count is the decision's own evaluation count — read at the
 *   condition's entry (the leftmost atom). The right operand is the short-circuit
 *   arm, matched in the right-operand range.
 * - **if / cond-expr / switch**: each explicit path matches an arm block by its
 *   entry location; implicit arms (if-without-else, switch-without-default) are
 *   derived as `decisionHits − Σ(matched explicit arm hits)`, clamped ≥ 0. The
 *   decision count is the matched decision's counter, or — when that decision
 *   block is uncounted (fused-logical condition) or no arm matched — derived from
 *   the condition's entry (leftmost-atom) hit count.
 *
 * @param branch - the source branch construct
 * @param armsByLine - file branch arm locations bucketed by line
 * @param expressionHitsByLine - file statement/expression hits bucketed by line (for condition-entry derivation)
 * @returns per-path hit counts aligned with branch.paths
 */
export function computeBranchPathHits(
  branch: ParsedSourceBranchInfo,
  armsByLine: Map<number, ArmHit[]>,
  expressionHitsByLine: Map<number, LineHit[]>
): number[] {
  const { branchType, paths, conditionRange, implicitPathIndices } = branch;

  if (branchType === 'switch') {
    // Switch lowers to a comparison chain whose case BODIES carry the per-case
    // counts. Arm-matching can't be used: an explicit `default` body is not an
    // out-edge target of any decision block, and the chain's comparison blocks
    // sit at the case-label positions and would mis-match. Instead, read each
    // case body's hits via statement-entry over its body range (paths[i] excludes
    // the `case X:` label); the switch-reached count (for an implicit default) is
    // the discriminant's entry hit count.
    const switchImplicit = new Set(implicitPathIndices);
    let explicitSum = 0;
    const switchHits = paths.map((path, index) => {
      if (switchImplicit.has(index)) {
        return 0; // implicit default — filled below
      }
      const caseHits = findStatementEntryHitCount(expressionHitsByLine, path);
      explicitSum += caseHits;
      return caseHits;
    });

    if (switchImplicit.size > 0) {
      const switchReached = findStatementEntryHitCount(expressionHitsByLine, conditionRange);
      const implicitHits = Math.max(0, switchReached - explicitSum);
      for (const index of implicitPathIndices) {
        switchHits[index] = implicitHits;
      }
    }

    return switchHits;
  }

  if (branchType === 'binary-expr') {
    // left = condition-entry (leftmost-atom) count; right = short-circuit arm.
    const leftEvaluated = findStatementEntryHitCount(expressionHitsByLine, conditionRange);
    const rightArm = paths[1] ? findArmAtRangeEntry(armsByLine, paths[1]) : undefined;
    return [leftEvaluated, rightArm?.armHits ?? 0];
  }

  const implicitIndices = new Set(implicitPathIndices);
  const hits: number[] = new Array(paths.length).fill(0);
  let matchedArmSum = 0;
  let owningDecisionHits: number | null | undefined = undefined;

  paths.forEach((path, index) => {
    if (implicitIndices.has(index)) {
      return; // implicit arm — derived below
    }
    const arm = findArmAtRangeEntry(armsByLine, path);
    if (arm) {
      hits[index] = arm.armHits;
      matchedArmSum += arm.armHits;
      if (owningDecisionHits === undefined) {
        owningDecisionHits = arm.decisionHits;
      }
    }
  });

  if (implicitIndices.size > 0) {
    // Prefer the matched decision's counter; fall back to the condition-entry
    // (leftmost-atom) count when the decision block is uncounted (fused-logical)
    // or no explicit arm matched.
    const decisionHits = owningDecisionHits ?? findStatementEntryHitCount(expressionHitsByLine, conditionRange);
    const implicitHits = Math.max(0, decisionHits - matchedArmSum);
    for (const index of implicitPathIndices) {
      hits[index] = implicitHits;
    }
  }

  return hits;
}
