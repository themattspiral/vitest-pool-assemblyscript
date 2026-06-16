/**
 * Istanbul Format Converter
 *
 * Converts AssemblyScript coverage data to Istanbul's FileCoverageData format.
 * This enables integration with Vitest's coverage reporting system and standard
 * coverage tools like Codecov, Coveralls, etc.
 *
 * Current Implementation: Function-level coverage only
 * - Uses containment matching: binary positions → source function ranges
 * - Each function maps to both a function entry AND a statement entry
 * - Statement coverage matches function coverage (function-level granularity)
 * - Branch coverage is 0% (no branches tracked yet)
 * - Line coverage derived from statement coverage
 *
 * Future Enhancement (v2): Block-level statement and branch coverage
 */

import type { FileCoverageData, Range, FunctionMapping, BranchMapping } from 'istanbul-lib-coverage';
import type { ParsedSourceFunctions } from '../types/types.js';
import { findFunctionContainingPosition } from './containment-matcher.js';
import { debugOverride, debug } from '../util/debug.js';

/**
 * Convert AssemblyScript coverage data to Istanbul format for a single file
 *
 * Algorithm (containment matching):
 * 1. For each hit position in fileHitCountsByPosition:
 *    - Use containment matcher to find which source function contains this position
 *    - Record the hit count for that function
 * 2. For each function in allSourceFuncsByPosition (unique collection from fileFunctionsByLineSpan):
 *    - Add function mapping to fnMap
 *    - Add function hit count to f (from matched hits, or 0 if not hit)
 *    - Add corresponding statement mapping to statementMap
 *    - Add same hit count to s (statement coverage matches function coverage)
 *
 * @param fileFunctionsByLineSpan - Functions for a single file, indexed by every line they span (from AST parser)
 * @param fileHitCountsByPosition - Hit counts for this file, keyed by position "line:column" (from accumulated coverage)
 * @param absoluteFilePath - Absolute path to the source file (for Istanbul output)
 * @returns Istanbul FileCoverage object
 */
export async function convertToIstanbulFormat(
  fileFunctions: ParsedSourceFunctions,
  fileHitCountsByPosition: Record<string, number>,
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
    const uniqueHitPosCount = Object.keys(fileHitCountsByPosition).length;
    const coverageEstimate = sourceFunctionCount === 0 ? Infinity : ((uniqueHitPosCount * 100) / sourceFunctionCount).toFixed(2);

    return `[IstanbulConverter]   Processing source file: "${absoluteFilePath}"\n`
    + `[IstanbulConverter]   Source: ${sourceFunctionCount} total functions, Coverage: ${uniqueHitPosCount} unique hit positions\n`
    + `[IstanbulConverter]   Sanity Check - AS File Coverage Estimate: ${coverageEstimate}%`;
  });

  // Build a map of function id → hit count using containment matching
  const functionHitCounts = new Map<string, number>();

  // For each actual hit position in the binary, find which source function contains it
  for (const [hitPositionKey, hitCount] of Object.entries(fileHitCountsByPosition)) {
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

    // Create corresponding statement mapping
    // For function-level coverage, each function is one "statement"
    // The statement range matches the function range
    // This gives us statement coverage at function granularity
    statementMap[idxStr] = istanbulRange;
    s[idxStr] = hitCount;

    funcIdx++;
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
