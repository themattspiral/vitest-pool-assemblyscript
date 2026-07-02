/**
 * Istanbul Format Converter
 *
 * Converts AssemblyScript coverage data to Istanbul's FileCoverageData format.
 * This enables integration with Vitest's coverage reporting system and standard
 * coverage tools like Codecov, Coveralls, etc.
 */

import type { FileCoverageData, Range, FunctionMapping, BranchMapping } from 'istanbul-lib-coverage';
import type { CoverageBundle, ParsedSourceFunctions, SourceRange } from '../types/types.js';
import {
  findFunctionContainingPosition,
  buildHitsByLine,
  findStatementEntryHitCount,
  buildArmsByLine,
  buildDecisionPositionsByLine,
  computeBranchPathHits,
} from './containment-matcher.js';
import { debugOverride, debug } from '../util/debug.js';

/**
 * Convert an internal 1-based-column SourceRange to an Istanbul Range (0-based columns).
 */
function toIstanbulRange(range: SourceRange): Range {
  return {
    start: { line: range.startLine, column: range.startColumn - 1 },
    end: { line: range.endLine, column: range.endColumn - 1 },
  };
}

/**
 * Convert AssemblyScript coverage data to Istanbul format for a single file.
 *
 * Function coverage (fnMap / f): hit data is aggregated at two levels. Per-POSITION
 * totals arrive already summed upstream (across monomorphizations in the executor,
 * and across tests/binaries in mergeCoverageData). Here each source function is
 * rolled up PER-FUNCTION: containment-match every position in fileFunctionHits to
 * the source function whose range contains it, and the function takes the combined
 * count of its position(s) — normally just its single representative location (or 0
 * when never hit).
 *
 * Statement coverage (statementMap / s): each source statement's count is read at
 * its entry position — the smallest-position hit within its range, from
 * fileExpressionHits (see findStatementEntryHitCount). Functions and statements
 * use independent Istanbul index keyspaces.
 *
 * Branch coverage (branchMap / b): each source branch's arms are matched to binary
 * decision arms by entry location; implicit arms and the logical left operand are
 * derived from the decision's evaluation count (see computeBranchPathHits).
 *
 * @param fileFunctions - Parsed source functions + statements + branches for one file (from the AST parser)
 * @param coverage - Accumulated run-level coverage bundle; the per-file view is sliced out by absoluteFilePath
 * @param fileLoaded - Whether this file loaded (compiled into an executed binary); credits module-level declarations that produce no runtime counter
 * @param absoluteFilePath - Absolute path to the source file (for Istanbul output + bundle slicing)
 * @param istanbulDebugEnabled - Enable verbose conversion logging
 * @returns Istanbul FileCoverage object
 */
export async function convertToIstanbulFormat(
  fileFunctions: ParsedSourceFunctions,
  coverage: CoverageBundle,
  fileLoaded: boolean,
  absoluteFilePath: string,
  istanbulDebugEnabled: boolean
): Promise<FileCoverageData> {
  const startMatch = performance.now();

  // Slice the per-file view out of the run-level bundle (each field is keyed by file first).
  const fileFunctionHits = coverage.functionHits.hitCountsByFileAndPosition[absoluteFilePath] ?? {};
  const fileExpressionHits = coverage.expressionHits.hitCountsByFileAndPosition[absoluteFilePath] ?? {};
  const fileBranchHits = coverage.branchHits.hitsByFileAndDecision[absoluteFilePath] ?? {};
  const fileEmptyCaseHits = coverage.emptyCaseHits.hitCountsByFileAndPosition[absoluteFilePath] ?? {};
  const fileDecisionPositions = coverage.decisionPositions.positionsByFile[absoluteFilePath] ?? [];

  function istanbulDebug(...args: any[]): void {
    if (istanbulDebugEnabled) {
      debugOverride(...args);
    }
  };

  istanbulDebug(() => {
    const sourceFunctionCount = Object.keys(fileFunctions.uniqueFunctions).length;
    const uniqueHitPosCount = Object.keys(fileFunctionHits).length;
    const coverageEstimate = sourceFunctionCount === 0 ? Infinity : ((uniqueHitPosCount * 100) / sourceFunctionCount).toFixed(2);

    return `[IstanbulConverter]   Processing source file: "${absoluteFilePath}"\n`
    + `[IstanbulConverter]   Source: ${sourceFunctionCount} total functions, Coverage: ${uniqueHitPosCount} unique hit positions\n`
    + `[IstanbulConverter]   Sanity Check - AS File Coverage Estimate: ${coverageEstimate}%`;
  });

  // Build a map of function id → hit count using containment matching
  const functionHitCounts = new Map<string, number>();

  // For each actual hit position in the binary, find which source function contains it
  for (const [hitPositionKey, hitCount] of Object.entries(fileFunctionHits)) {
    // Hit position key format is "line:column"
    const parts = hitPositionKey.split(':');
    const lineStr = parts[0];
    const columnStr = parts[1];

    if (lineStr && columnStr) {
      const line = parseInt(lineStr, 10);
      const column = parseInt(columnStr, 10);

      const containStart = performance.now();
      const containingFunction = findFunctionContainingPosition(fileFunctions.functionsByLineSpan, line, column);
      
      if (containingFunction) {
        istanbulDebug(`[IstanbulConverter]     Hit Position ${hitPositionKey} → function "${containingFunction.shortName}" in ${(performance.now() - containStart).toFixed(2)}ms`);
        
        // Per-FUNCTION roll-up: a source function's count is the SUM of the
        // position(s) that fall inside its range. Each `fileFunctionHits` entry is
        // already the fully summed total for ONE source position (summed upstream
        // across monomorphizations in the executor and across tests/binaries in
        // mergeCoverageData). Normally a function maps to a single position, so this
        // sets its count once. When more than one position maps to a function — e.g.
        // its representative location differs between binaries (different `--runtime`
        // lowerings, or ungrouped monomorphizations) — those positions are always
        // distinct executions, so summing is correct and never double-counts; max
        // would under-count by reporting only the largest.
        const existingHits = functionHitCounts.get(containingFunction.id);
        const combined = (existingHits ?? 0) + hitCount;
        functionHitCounts.set(containingFunction.id, combined);

        if (existingHits !== undefined) {
          istanbulDebug(`[IstanbulConverter]     Hit Position ${hitPositionKey} → function "${containingFunction.shortName}" EXISTING HITS: ${existingHits} NEW COUNT: ${combined}`);
        } else {
          istanbulDebug(`[IstanbulConverter]     Hit Position ${hitPositionKey} → function "${containingFunction.shortName}" (hits: ${hitCount})`);
        }
      } else {
        istanbulDebug(`[IstanbulConverter]     Hit Position ${hitPositionKey} has no containing function ( in ${(performance.now() - containStart).toFixed(2)}ms )`);
      }
    }
  }

  const startConvert = performance.now();
  istanbulDebug(`[IstanbulConverter]   Matching Complete - Converting to Istanbul format`);

  // Initialize Istanbul data structures
  const fnMap: { [key: string]: FunctionMapping } = {};
  const f: { [key: string]: number } = {};
  const statementMap: { [key: string]: Range } = {};
  const s: { [key: string]: number } = {};
  const branchMap: { [key: string]: BranchMapping } = {};
  const b: { [key: string]: number[] } = {};

  // Convert function coverage to Istanbul format
  // Iterate all functions from parsed source (ensures 0-hit functions are included)
  let funcIdx = 0;
  for (const { range, shortName, id } of Object.values(fileFunctions.uniqueFunctions)) {
    // Defensive: skip functions with invalid metadata (shouldn't happen - AST parser filters these)
    if (range.startLine === 0) {
      continue;
    }

    // Get hit count from containment matching (or 0 if not hit)
    const hitCount = functionHitCounts.get(id) ?? 0;

    const displayShortName = shortName && shortName !== '' ? shortName : '<anonymous>';
    istanbulDebug(
      `[IstanbulConverter]     Istanbul function index ${funcIdx}: "${displayShortName}"`
      + ` (source ${range.startLine}:${range.startColumn} - ${range.endLine}:${range.endColumn}), hits: ${hitCount}`
    );

    // Create function mapping
    // Both 'decl' (declaration) and 'loc' (location) use the same range
    const istanbulRange = toIstanbulRange(range);

    const idxStr = funcIdx.toString();
    fnMap[idxStr] = {
      name: shortName,
      decl: istanbulRange,
      loc: istanbulRange,
      line: range.startLine
    };
    f[idxStr] = hitCount;

    funcIdx++;
  }

  // Convert statement coverage to Istanbul format. Each source statement's hit
  // count is read at its ENTRY position (the smallest-position hit within its
  // range); for a compound statement this is the header/condition, never the
  // hotter body. Statements use their own index keyspace, independent of fnMap.
  const expressionHitsByLine = buildHitsByLine(fileExpressionHits);
  let stmtIdx = 0;
  for (const { range, isModuleLevelDeclaration } of fileFunctions.statements) {
    // Defensive: skip statements with invalid metadata
    if (range.startLine === 0) {
      continue;
    }

    let hitCount = findStatementEntryHitCount(expressionHitsByLine, range);

    // A module-scope variable declaration runs at module instantiation, so if the
    // file loaded it executed — even when its initializer folded to a WASM global
    // with no runtime counter (findStatementEntryHitCount then reads 0). Credit it
    // as covered to match V8, which counts the declaration when the module evaluates.
    if (isModuleLevelDeclaration && fileLoaded && hitCount === 0) {
      hitCount = 1;
    }

    const stmtIdxStr = stmtIdx.toString();
    statementMap[stmtIdxStr] = toIstanbulRange(range);
    s[stmtIdxStr] = hitCount;
    stmtIdx++;
  }

  // Convert branch coverage to Istanbul format. Each source branch's arms are
  // matched to binary decision arms by entry location; implicit arms (else /
  // default) and the logical left operand are derived from the decision's
  // evaluation count (see computeBranchPathHits). Branches use their own index
  // keyspace, independent of fnMap / statementMap.
  const armsByLine = buildArmsByLine(fileBranchHits);
  const caseHitsByLine = buildHitsByLine(fileEmptyCaseHits);
  const decisionPositionsByLine = buildDecisionPositionsByLine(fileDecisionPositions);
  let branchIdx = 0;
  for (const branch of fileFunctions.branches) {
    // Defensive: skip branches with invalid metadata
    if (branch.range.startLine === 0) {
      continue;
    }

    const pathHits = computeBranchPathHits(branch, armsByLine, expressionHitsByLine, caseHitsByLine, decisionPositionsByLine);

    const branchIdxStr = branchIdx.toString();
    branchMap[branchIdxStr] = {
      type: branch.branchType,
      loc: toIstanbulRange(branch.range),
      locations: branch.paths.map(toIstanbulRange),
      line: branch.range.startLine,
    };
    b[branchIdxStr] = pathHits;
    branchIdx++;
  }

  const done = performance.now();
  const matchingMs = (startConvert - startMatch).toFixed(2);
  const convertMs = (done - startConvert).toFixed(2);
  const totalMs = (done - startMatch).toFixed(2);

  debug(
    `[IstanbulConverter]   Coverage Conversion Complete: ${Object.keys(fnMap).length} functions,` 
    + ` ${totalMs} ms total (matching: ${matchingMs} ms, conversion: ${convertMs} ms)`
  );

  return {
    path: absoluteFilePath,
    fnMap,
    f,
    statementMap,
    s,
    branchMap,
    b
  };
}
