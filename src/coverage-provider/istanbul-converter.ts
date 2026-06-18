/**
 * Istanbul Format Converter
 *
 * Converts AssemblyScript coverage data to Istanbul's FileCoverageData format.
 * This enables integration with Vitest's coverage reporting system and standard
 * coverage tools like Codecov, Coveralls, etc.
 *
 * Current Implementation: Function + statement coverage
 * - Functions: containment matching (binary hit position → source function range)
 * - Statements: each source statement's count read at its entry position
 *   (smallest-position hit within its range) from block-level expression hits
 * - Branch coverage is 0% (no branches tracked yet)
 * - Line coverage derived from statement coverage
 *
 * Future Enhancement: Branch coverage
 */

import type { FileCoverageData, Range, FunctionMapping, BranchMapping } from 'istanbul-lib-coverage';
import type { ParsedSourceFunctions } from '../types/types.js';
import { findFunctionContainingPosition, buildHitsByLine, findStatementEntryHitCount } from './containment-matcher.js';
import { debugOverride, debug } from '../util/debug.js';

/**
 * Convert AssemblyScript coverage data to Istanbul format for a single file.
 *
 * Function coverage (fnMap / f): for each binary hit position in fileFunctionHits,
 * containment-match it to the source function whose range contains it; each
 * source function then gets its matched hit count (or 0 when never hit).
 *
 * Statement coverage (statementMap / s): each source statement's count is read at
 * its entry position — the smallest-position hit within its range, from
 * fileExpressionHits (see findStatementEntryHitCount). Functions and statements
 * use independent Istanbul index keyspaces.
 *
 * Branch coverage (branchMap / b) is not produced yet.
 *
 * @param fileFunctions - Parsed source functions + statements for one file (from the AST parser)
 * @param fileFunctionHits - Function-level hit counts, keyed by position "line:column"
 * @param fileExpressionHits - Statement/expression-level hit counts, keyed by position "line:column"
 * @param absoluteFilePath - Absolute path to the source file (for Istanbul output)
 * @param istanbulDebugEnabled - Enable verbose conversion logging
 * @returns Istanbul FileCoverage object
 */
export async function convertToIstanbulFormat(
  fileFunctions: ParsedSourceFunctions,
  fileFunctionHits: Record<string, number>,
  fileExpressionHits: Record<string, number>,
  absoluteFilePath: string,
  istanbulDebugEnabled: boolean
): Promise<FileCoverageData> {
  const startMatch = performance.now();

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
        
        // Accumulate hits (in case multiple positions map to same function)
        const existingHits = functionHitCounts.get(containingFunction.id);
        const existingHitsCount = existingHits ?? 0;
        const max = Math.max(existingHitsCount, hitCount);
        functionHitCounts.set(containingFunction.id, max); // <-- TODO: Explain this max logic

        if (existingHits !== undefined) {
          istanbulDebug(`[IstanbulConverter]     Hit Position ${hitPositionKey} → function "${containingFunction.shortName}" EXISTING HITS: ${existingHits} NEW COUNT: ${max}`);
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
    // Internal ParsedSourceFunctionInfo uses 1-based columns, Istanbul expects 0-based
    const istanbulRange: Range = {
      start: { line: range.startLine, column: range.startColumn - 1 },
      end: { line: range.endLine, column: range.endColumn - 1 }
    };

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
  for (const { range } of fileFunctions.statements) {
    // Defensive: skip statements with invalid metadata
    if (range.startLine === 0) {
      continue;
    }

    const hitCount = findStatementEntryHitCount(expressionHitsByLine, range);

    // Internal ranges use 1-based columns; Istanbul expects 0-based.
    const stmtRange: Range = {
      start: { line: range.startLine, column: range.startColumn - 1 },
      end: { line: range.endLine, column: range.endColumn - 1 }
    };

    const stmtIdxStr = stmtIdx.toString();
    statementMap[stmtIdxStr] = stmtRange;
    s[stmtIdxStr] = hitCount;
    stmtIdx++;
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
