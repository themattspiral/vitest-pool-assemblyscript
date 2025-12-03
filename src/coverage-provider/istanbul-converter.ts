/**
 * Istanbul Format Converter
 *
 * Converts AssemblyScript coverage data to Istanbul's FileCoverageData format.
 * This enables integration with Vitest's coverage reporting system and standard
 * coverage tools like Codecov, Coveralls, etc.
 *
 * Current Implementation: Function-level coverage only
 * - Each function maps to both a function entry AND a statement entry
 * - Statement coverage matches function coverage (function-level granularity)
 * - Branch coverage is 0% (no branches tracked yet)
 * - Line coverage derived from statement coverage
 *
 * Future Enhancement (v2): Block-level statement and branch coverage
 */

import type { FileCoverageData, Range, FunctionMapping, BranchMapping } from 'istanbul-lib-coverage';
import type { CoverageData, ParsedSourceInfo } from '../types.js';
import { debug } from '../utils/debug.mjs';

/**
 * Convert AssemblyScript coverage data to Istanbul format
 *
 * Algorithm:
 * 1. Get functions for the target file from parsedSourceInfo
 * 2. Get hit counts for the target file from coverageData
 * 3. For each function with valid metadata (startLine > 0):
 *    - Add function mapping to fnMap (from parsedSourceInfo)
 *    - Add function hit count to f (from coverageData)
 *    - Add corresponding statement mapping to statementMap (at function start line)
 *    - Add same hit count to s (statement coverage matches function coverage)
 * 4. Add dummy uncovered branch at line 0 (shows 0% instead of misleading 100% for 0/0)
 *
 * @param parsedSourceInfo - Parsed source info with function metadata (names, ranges)
 * @param coverageData - Coverage data with hit counts (position -> hit count)
 * @param filePath - Absolute path to the source file
 * @returns Istanbul FileCoverage object
 */
export function convertToIstanbulFormat(
  parsedSourceInfo: ParsedSourceInfo,
  coverageData: CoverageData,
  filePath: string
): FileCoverageData {
  debug(`[IstanbulConverter] Converting coverage for file: ${filePath}`);

  // Get functions for this specific file from parsed source
  const fileFunctions = parsedSourceInfo.functionsByFileAndPosition[filePath];
  if (!fileFunctions) {
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
  const fileHitCounts = coverageData.hitCountsByFileAndPosition[filePath] ?? {};

  // DEBUG: Show what keys exist
  debug(`[IstanbulConverter] Looking up filePath: ${filePath}`);
  debug(`[IstanbulConverter] parsedSourceInfo keys: ${Object.keys(fileFunctions).slice(0, 3).join(', ')}`);
  debug(`[IstanbulConverter] fileHitCounts keys: ${Object.keys(fileHitCounts).slice(0, 3).join(', ')}`);
  debug(`[IstanbulConverter] MATCH CHECK: parsed=${Object.keys(fileFunctions)[0]} vs hits=${Object.keys(fileHitCounts)[0]}`);

  const funcCount = Object.keys(fileFunctions).length;
  debug(`[IstanbulConverter] File has ${funcCount} functions`);

  // Initialize Istanbul data structures
  const fnMap: { [key: string]: FunctionMapping } = {};
  const f: { [key: string]: number } = {};
  const statementMap: { [key: string]: Range } = {};
  const s: { [key: string]: number } = {};
  const branchMap: { [key: string]: BranchMapping } = {};
  const b: { [key: string]: number[] } = {};

  // Convert function coverage to Istanbul format
  let funcIdx = 0;
  for (const [positionKey, funcInfo] of Object.entries(fileFunctions)) {
    const { range, shortName } = funcInfo;

    // Skip functions without valid metadata
    // Functions with startLine === 0 are compiler-generated or missing metadata
    if (range.startLine === 0) {
      funcIdx++;
      continue;
    }

    // Get hit count from coverage data using position key
    const hitCount = fileHitCounts[positionKey] ?? 0;

    debug(`[IstanbulConverter] Function ${funcIdx}: "${shortName}" at ${positionKey} hit ${hitCount} times (key exists: ${positionKey in fileHitCounts})`);

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

  // Add dummy uncovered branch to show 0% instead of 100% (0/0)
  // We don't have branch coverage yet, so this prevents misleading 100% reports
  // Uses line 0 which won't appear in source display
  const dummyRange = { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
  branchMap['0'] = {
    type: 'binary-expr',
    loc: dummyRange,
    locations: [dummyRange],
    line: 0
  };
  b['0'] = [0];

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
