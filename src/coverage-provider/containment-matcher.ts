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
import { debug } from '../util/debug.js';

/**
 * A binary hit position's column + count on a given line (bucketed for statement matching).
 */
interface LineHit {
  column: number;
  count: number;
}

/**
 * A branch arm's column + hit count on a line, plus the decision it belongs to
 * (decision key + that decision's evaluation count). Bucketed by line so source
 * arm matching can scan only the lines a source arm range spans.
 */
interface ArmHit {
  column: number;
  armHits: number;
  decisionKey: string;
  /** The owning decision's evaluation count, or null when its block is uncounted (fused-logical). */
  decisionHits: number | null;
}

/**
 * Check if a position (line, column) falls within a source range.
 *
 * @param line - Target line number (1-based)
 * @param column - Target column number (1-based)
 * @param range - Source range to check against
 * @returns true if position is within range (inclusive)
 */
function isPositionInRange(
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
 * within the statement's range. The entry expression sits at the
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
 * Bucket a file's binary decision-block source positions by line, for fast
 * condition-range containment checks. Built once per file (transient).
 */
export function buildDecisionPositionsByLine(positions: string[]): Map<number, number[]> {
  const byLine = new Map<number, number[]>();

  for (const positionKey of positions) {
    const colonIndex = positionKey.indexOf(':');
    if (colonIndex < 0) continue;

    const line = parseInt(positionKey.slice(0, colonIndex), 10);
    const column = parseInt(positionKey.slice(colonIndex + 1), 10);
    if (Number.isNaN(line) || Number.isNaN(column)) continue;

    const bucket = byLine.get(line);
    if (bucket) {
      bucket.push(column);
    } else {
      byLine.set(line, [column]);
    }
  }

  return byLine;
}

/**
 * Whether a range contains any binary decision position — the signal that a source
 * branch was NOT compiler-folded. A real branch always emits a decision block
 * (even never-executed); a constant-folded one emits none. So a branch whose
 * condition range contains no decision position was folded.
 */
export function conditionRangeContainsDecision(
  decisionPositionsByLine: Map<number, number[]>,
  range: SourceRange
): boolean {
  for (let line = range.startLine; line <= range.endLine; line++) {
    const columns = decisionPositionsByLine.get(line);
    if (!columns) continue;
    for (const column of columns) {
      if (isPositionInRange(line, column, range)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Compute Istanbul per-path hit counts for one source branch.
 *
 * - **binary-expr** (logical `&&`/`||`): Istanbul reports `[leftEvaluated,
 *   rightEvaluated]`. The left operand is evaluated whenever the operator is
 *   reached, so its count is the decision's own evaluation count — read at the
 *   condition's entry (the leftmost atom). The right operand is the short-circuit
 *   arm, matched in the right-operand range.
 * - **if / cond-expr**: each explicit path matches an arm block by its entry
 *   location; the implicit arm (if-without-else) is derived as `decisionHits −
 *   Σ(matched explicit arm hits)`, clamped ≥ 0. The decision count is the matched
 *   decision's counter, or — when that decision block is uncounted (fused-logical
 *   condition) or no arm matched — derived from the condition's entry (leftmost-
 *   atom) hit count.
 * - **switch**: has its own mechanism (not arm-driven — the comparison chain's
 *   false-edge arms collide at case-label positions). Each case's entered count is
 *   read at its clause: a body-bearing case (and an explicit default) via
 *   statement-entry over its body range; an EMPTY fall-through case via the
 *   dedicated `caseHitsByLine` channel (its post-anchored counter, keyed by
 *   case-label position). A default-less switch's implicit "no case matched" arm is
 *   `switchReached − Σ(entered counts of group-TERMINAL cases)`: a fall-through case
 *   (`fallThroughCasePathIndices`) is excluded because its matches already telescope
 *   into the entered count of the terminal case it flows into, so summing every case
 *   would double-count the fall-through and under-derive the default.
 *   *Residual (best-effort):* a CONDITIONAL break (`if (c) break;`) makes a case's
 *   fall-through runtime-dependent, but the classification is static — so the implicit
 *   default for such a case is off by the number of entries that conditionally broke
 *   out. The explicit case arms and the v8-parity cases are unaffected.
 *
 * **Folded branches** (`if`/`cond-expr`/`binary-expr` with a compile-time-constant
 * condition): the compiler emits no decision block, so the condition range contains
 * no decision position. These can't be arm-matched. They are read from executed
 * code instead, matching v8: `if`/`cond-expr` → each explicit arm by statement-entry
 * over its body (the live arm has hits, the dead arm was eliminated → 0), implicit
 * arm → 0; `binary-expr` → left always reached (1), right = whether the right operand
 * survived (was evaluated) per short-circuit.
 *
 * @param branch - the source branch construct
 * @param armsByLine - file branch arm locations bucketed by line
 * @param expressionHitsByLine - file statement/expression hits bucketed by line (for condition-entry derivation)
 * @param caseHitsByLine - file empty fall-through switch-case hits bucketed by line (case-label positions)
 * @param decisionPositionsByLine - file binary decision positions bucketed by line (for folded-branch detection)
 * @returns per-path hit counts aligned with branch.paths
 */
export function computeBranchPathHits(
  branch: ParsedSourceBranchInfo,
  armsByLine: Map<number, ArmHit[]>,
  expressionHitsByLine: Map<number, LineHit[]>,
  caseHitsByLine: Map<number, LineHit[]>,
  decisionPositionsByLine: Map<number, number[]>
): number[] {
  const { branchType, range, paths, conditionRange, implicitPathIndices, emptyCasePathIndices, fallThroughCasePathIndices } = branch;

  if (branchType === 'switch') {
    // Switch lowers to a comparison chain. Arm-matching can't be used: the chain's
    // false-edge arms land at case-label positions (and an explicit `default` body
    // is not an out-edge target of any decision), so both collide. Instead read
    // each case at its clause:
    //   - body-bearing case / explicit default: statement-entry over its body range
    //     (paths[i] excludes the `case X:` label, whose position holds the wrong
    //     comparison count);
    //   - empty fall-through case: the dedicated caseHitsByLine channel (its
    //     post-anchored counter, keyed by the case-label position), read via the
    //     same entry-position lookup over the clause range.
    //
    // A default-less switch's implicit "no case matched" arm is switchReached minus
    // the number of entries that matched SOME case (its DISTINCT matches), where
    // switchReached is the discriminant's entry hit count. Distinct matches is the
    // sum of the entered counts of group-TERMINAL cases only: a fall-through case's
    // matches are already folded into the entered count of the terminal case it flows
    // into (entered counts telescope across a fall-through group), so summing every
    // case's entered count would double-count the fall-through and under-derive the
    // default. fallThroughCasePathIndices marks the non-terminal cases to exclude.
    const switchImplicit = new Set(implicitPathIndices);
    const switchEmptyCases = new Set(emptyCasePathIndices);
    const switchFallThrough = new Set(fallThroughCasePathIndices);
    let matchedSum = 0;
    const switchHits = paths.map((path, index) => {
      if (switchImplicit.has(index)) {
        return 0; // implicit default — filled below
      }
      const caseHits = switchEmptyCases.has(index)
        ? findStatementEntryHitCount(caseHitsByLine, path)
        : findStatementEntryHitCount(expressionHitsByLine, path);
      if (!switchFallThrough.has(index)) {
        matchedSum += caseHits; // only group-terminal cases count toward distinct matches
      }
      return caseHits;
    });

    if (switchImplicit.size > 0) {
      const switchReached = findStatementEntryHitCount(expressionHitsByLine, conditionRange);
      // A negative raw value signals a matching anomaly (a mis-located case arm, or a
      // conditional-break case mis-classified as fall-through — a documented residual).
      const rawImplicit = switchReached - matchedSum;
      if (rawImplicit < 0) {
        debug(() => `[containment-matcher] negative implicit-default derivation for switch at ${range.startLine}:${range.startColumn} (switchReached=${switchReached}, matchedSum=${matchedSum}) — clamped to 0`);
      }
      const implicitHits = Math.max(0, rawImplicit);
      for (const index of implicitPathIndices) {
        switchHits[index] = implicitHits;
      }
    }

    return switchHits;
  }

  // A branch whose condition range contains no binary decision was compiler-folded
  // (constant condition → no decision block). Folded branches can't be arm-matched;
  // they are read from the executed code instead, matching v8.
  const isFolded = !conditionRangeContainsDecision(decisionPositionsByLine, conditionRange);

  if (branchType === 'binary-expr') {
    if (isFolded) {
      // Constant LEFT operand: the short-circuit decision folded away. The left is
      // always reached (count = statement-entry over the whole construct); the
      // right is evaluated iff the left's value triggers it (`&&` left-true,
      // `||` left-false), recoverable as whether the right operand survived in the
      // binary (statement-entry over its range — eliminated when short-circuited).
      const reached = findStatementEntryHitCount(expressionHitsByLine, range);
      const rightEvaluated = paths[1] ? findStatementEntryHitCount(expressionHitsByLine, paths[1]) : 0;
      return [reached, rightEvaluated];
    }
    // left = condition-entry (leftmost-atom) count; right = short-circuit arm.
    const leftEvaluated = findStatementEntryHitCount(expressionHitsByLine, conditionRange);
    const rightArm = paths[1] ? findArmAtRangeEntry(armsByLine, paths[1]) : undefined;
    return [leftEvaluated, rightArm?.armHits ?? 0];
  }

  // if / cond-expr
  if (isFolded) {
    // Constant condition: no decision block. Each explicit arm is read by
    // statement-entry over its body — the live arm has hits, the dead arm was
    // eliminated by the compiler → 0. An implicit arm (if-without-else) has no
    // body, so it is 0.
    //
    // KNOWN, ACCEPTED LIMITATION (cond-expr only): when BOTH ternary arms are
    // compile-time constants (`cond ? 10 : 20`), the whole expression folds to a
    // single result Const at the construct start — neither arm range catches it,
    // so both read 0 (v8 would report the live arm covered). A folded ternary with
    // any non-constant arm works, because the live arm's code survives at its own
    // position. The const/const case is inherent to CFG/compiled-output coverage
    // (the compiler erased the distinction); documented, not fixed.
    const foldedImplicit = new Set(implicitPathIndices);
    return paths.map((path, index) =>
      foldedImplicit.has(index) ? 0 : findStatementEntryHitCount(expressionHitsByLine, path)
    );
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
    // A negative raw value signals a matching anomaly (e.g. a mis-located arm whose
    // hits were attributed elsewhere); surface it before clamping.
    const rawImplicit = decisionHits - matchedArmSum;
    if (rawImplicit < 0) {
      debug(() => `[containment-matcher] negative implicit-arm derivation for ${branchType} at ${range.startLine}:${range.startColumn} (decisionHits=${decisionHits}, matchedArmSum=${matchedArmSum}) — clamped to 0`);
    }
    const implicitHits = Math.max(0, rawImplicit);
    for (const index of implicitPathIndices) {
      hits[index] = implicitHits;
    }
  }

  return hits;
}
