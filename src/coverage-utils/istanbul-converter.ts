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

import type { CoverageData } from '../types.js';
import { debug } from '../utils/debug.mjs';

/**
 * Istanbul range format (line and column positions)
 */
interface IstanbulRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Istanbul function mapping format
 */
interface IstanbulFunctionMapping {
  name: string;
  decl: IstanbulRange;
  loc: IstanbulRange;
  line: number;
}

/**
 * Raw Istanbul file coverage data structure
 * This is what istanbul-lib-coverage expects when calling addFileCoverage()
 */
interface IstanbulFileCoverageData {
  path: string;
  statementMap: Record<string, IstanbulRange>;
  fnMap: Record<string, IstanbulFunctionMapping>;
  branchMap: Record<string, any>;
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
}

/**
 * Convert AssemblyScript coverage data to Istanbul format
 *
 * Algorithm:
 * 1. Get functions for the target file from coverageData
 * 2. For each function with valid metadata (startLine > 0):
 *    - Add function mapping to fnMap
 *    - Add function hit count to f
 *    - Add corresponding statement mapping to statementMap (at function start line)
 *    - Add same hit count to s (statement coverage matches function coverage)
 * 3. Leave branchMap and b empty (0% branch coverage for now)
 *
 * @param coverageData - Coverage data with function info and hit counts
 * @param filePath - Absolute path to the source file
 * @returns Istanbul FileCoverage object
 */
export function convertToIstanbulFormat(
  coverageData: CoverageData,
  filePath: string
): IstanbulFileCoverageData {
  debug(`[IstanbulConverter] Converting coverage for file: ${filePath}`);

  // Get functions for this specific file
  const fileFunctions = coverageData.functionsByFilePath[filePath];
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

  const funcCount = Object.keys(fileFunctions).length;
  debug(`[IstanbulConverter] File has ${funcCount} functions`);

  // Initialize Istanbul data structures
  const fnMap: Record<string, IstanbulFunctionMapping> = {};
  const f: Record<string, number> = {};
  const statementMap: Record<string, IstanbulRange> = {};
  const s: Record<string, number> = {};
  const branchMap: Record<string, any> = {};
  const b: Record<string, number[]> = {};

  // Convert function coverage to Istanbul format
  let funcIdx = 0;
  for (const [funcName, funcCovInfo] of Object.entries(fileFunctions)) {
    const { info, hitCount } = funcCovInfo;

    // Skip functions without valid metadata
    // Functions with startLine === 0 are compiler-generated or missing metadata
    if (info.startLine === 0) {
      funcIdx++;
      continue;
    }

    debug(`[IstanbulConverter] Function ${funcIdx}: "${funcName}" hit ${hitCount} times, lines ${info.startLine}-${info.endLine}`);

    // Create function mapping
    // Both 'decl' (declaration) and 'loc' (location) use the same range
    // We don't track column numbers, so use 0 for all columns
    // TODO - why don't we track column numbers???
    const range: IstanbulRange = {
      start: { line: info.startLine, column: 0 },
      end: { line: info.endLine, column: 0 }
    };

    const idxStr = funcIdx.toString();
    fnMap[idxStr] = {
      name: funcName,
      decl: range,
      loc: range,
      line: info.startLine
    };
    f[idxStr] = hitCount;

    // Create corresponding statement mapping
    // For function-level coverage, each function is one "statement"
    // The statement range matches the function range
    // This gives us statement coverage at function granularity
    statementMap[idxStr] = range;
    s[idxStr] = hitCount;

    funcIdx++;
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
