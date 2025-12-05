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

import { relative, resolve } from 'node:path';
import type { FileCoverageData, Range, FunctionMapping, BranchMapping } from 'istanbul-lib-coverage';
import type { CoverageData, ParsedSourceInfo, ParsedSourceFunctionInfo } from '../types.js';
import { findFunctionContainingPosition } from './containment-matcher.js';
import { debug } from '../utils/debug.mjs';

// resolve the correct root - this file is built to dist/coverage-provider
const PROJECT_ROOT = resolve(import.meta.dirname, '../..');

/**
 * Convert AssemblyScript coverage data to Istanbul format
 *
 * Algorithm (containment matching):
 * 1. Get functions for the target file from parsedSourceInfo (keyed by start line)
 * 2. Get hit counts for the target file from coverageData (keyed by position)
 * 3. For each hit position in coverageData:
 *    - Use containment matcher to find which source function contains this position
 *    - Record the hit count for that function
 * 4. For each function in parsedSourceInfo:
 *    - Add function mapping to fnMap
 *    - Add function hit count to f (from matched hits, or 0 if not hit)
 *    - Add corresponding statement mapping to statementMap
 *    - Add same hit count to s (statement coverage matches function coverage)
 *
 * @param parsedSourceInfo - Parsed source info with function metadata (names, ranges), keyed by absolute path
 * @param coverageData - Coverage data with hit counts (position -> hit count), keyed by relative path
 * @param filePath - Absolute path to the source file
 * @returns Istanbul FileCoverage object
 */
export function convertToIstanbulFormat(
  parsedSourceInfo: ParsedSourceInfo,
  coverageData: CoverageData,
  filePath: string
): FileCoverageData {
  debug(`[IstanbulConverter] Converting coverage for file: ${filePath}`);

  // Get functions for this specific file from parsed source (keyed by start line)
  const functionsByStartLine = parsedSourceInfo.functionsByFileAndStartLine[filePath];
  if (!functionsByStartLine) {
    debug(`[IstanbulConverter] No functions found for ${filePath}`);
    return {
      path: filePath,
      fnMap: {},
      f: {},
      statementMap: {},
      s: {},
      branchMap: {},
      b: {}
    };
  }

  // Get hit counts for this file
  // coverageData is keyed by relative path, so convert absolute filePath to relative
  const relativeFilePath = relative(PROJECT_ROOT, filePath);
  const fileHitCounts = coverageData.hitCountsByFileAndPosition[relativeFilePath] ?? {};

  // Count total functions for debugging
  const funcCount = Object.values(functionsByStartLine).reduce((sum, funcs) => sum + funcs.length, 0);
  debug(`[IstanbulConverter] File has ${funcCount} functions, ${Object.keys(fileHitCounts).length} hit positions`);

  // Build a map of function -> hit count using containment matching
  // Key: function identity (qualifiedName), Value: hit count
  const functionHitCounts = new Map<ParsedSourceFunctionInfo, number>();

  // For each hit position, find which function contains it
  for (const [positionKey, hitCount] of Object.entries(fileHitCounts)) {
    // Position key format is "line:column"
    const parts = positionKey.split(':');
    const lineStr = parts[0];
    const columnStr = parts[1];

    if (lineStr && columnStr) {
      const line = parseInt(lineStr, 10);
      const column = parseInt(columnStr, 10);

      const containingFunction = findFunctionContainingPosition(functionsByStartLine, line, column);
      if (containingFunction) {
        // Accumulate hits (in case multiple positions map to same function)
        const existingHits = functionHitCounts.get(containingFunction) ?? 0;
        functionHitCounts.set(containingFunction, Math.max(existingHits, hitCount));
        debug(`[IstanbulConverter] Position ${positionKey} -> function "${containingFunction.shortName}" (hits: ${hitCount})`);
      } else {
        debug(`[IstanbulConverter] Position ${positionKey} has no containing function`);
      }
    }
  }

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
  for (const functions of Object.values(functionsByStartLine)) {
    for (const funcInfo of functions) {
      const { range, shortName } = funcInfo;

      // Defensive: skip functions with invalid metadata (shouldn't happen - AST parser filters these)
      if (range.startLine === 0) {
        continue;
      }

      // Get hit count from containment matching (or 0 if not hit)
      const hitCount = functionHitCounts.get(funcInfo) ?? 0;

      debug(`[IstanbulConverter] Function ${funcIdx}: "${shortName}" at ${range.startLine}:${range.startColumn} hit ${hitCount} times`);

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
  }

  debug(`[IstanbulConverter] Result for ${filePath}: ${Object.keys(fnMap).length} functions added`);

  return {
    path: filePath,
    fnMap,
    f,
    statementMap,
    s,
    branchMap,
    b
  };
}
