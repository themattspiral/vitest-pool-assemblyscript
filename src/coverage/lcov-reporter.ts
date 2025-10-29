/**
 * LCOV Coverage Reporter
 *
 * Generates LCOV format coverage reports from collected coverage data.
 * LCOV format is industry-standard and works with Codecov, Coveralls, and other tools.
 *
 * Format specification: http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
 */

import { writeFile, mkdir } from 'fs/promises';
import type { CoverageData, DebugInfo, AggregatedCoverage } from '../types.js';
import { debug } from '../utils/debug.mjs';

/**
 * Aggregate coverage data from multiple tests
 *
 * @param coverageDataList - Array of coverage data from individual tests
 * @returns Aggregated coverage data
 */
export function aggregateCoverage(coverageDataList: CoverageData[]): AggregatedCoverage {
  const aggregated: AggregatedCoverage = {
    functions: {},
    blocks: {},
  };

  for (const coverage of coverageDataList) {
    // Aggregate function coverage
    for (const [funcKey, count] of Object.entries(coverage.functions)) {
      aggregated.functions[funcKey] = (aggregated.functions[funcKey] || 0) + count;
    }

    // Aggregate block coverage
    for (const [blockKey, count] of Object.entries(coverage.blocks)) {
      aggregated.blocks[blockKey] = (aggregated.blocks[blockKey] || 0) + count;
    }
  }

  return aggregated;
}

/**
 * Generate LCOV report from coverage data
 *
 * @param coverage - Aggregated coverage data
 * @param debugInfo - Debug info mapping function indices to source locations
 * @param sourceFile - Path to the source file being reported
 * @returns LCOV format string
 */
export function generateLCOV(
  coverage: AggregatedCoverage,
  debugInfo: DebugInfo,
  sourceFile: string
): string {
  const lines: string[] = [];

  // Start test name (optional, using source file name)
  lines.push(`TN:`);

  // Source file
  lines.push(`SF:${sourceFile}`);

  // Function coverage (FN and FNDA records)
  // FN:<line number>,<function name>
  // FNDA:<execution count>,<function name>

  const functionNames = new Map<number, string>();
  const functionLines = new Map<number, number>();
  const writtenFunctions = new Set<string>(); // Track written FN entries to avoid duplicates

  debugInfo.functions.forEach((funcInfo, funcIdx) => {
    const funcName = funcInfo.name;
    const line = funcInfo.startLine;

    // Skip functions without metadata (startLine === 0 means no metadata from AS transform)
    // These are compiler-generated functions we can't map to source
    if (line === 0) {
      debug(`[LCOV] Skipping function without metadata: ${funcName}`);
      return;
    }

    functionNames.set(funcIdx, funcName);
    functionLines.set(funcIdx, line);

    // FN:<line>,<function name>
    // Deduplicate: only write each unique (line, name) pair once
    const fnKey = `${line}:${funcName}`;
    if (!writtenFunctions.has(fnKey)) {
      lines.push(`FN:${line},${funcName}`);
      writtenFunctions.add(fnKey);
    }
  });

  // Function execution data (FNDA records)
  // Aggregate execution counts for functions with same (line, name)
  const fndaAggregated = new Map<string, number>();

  for (let funcIdx = 0; funcIdx < debugInfo.functions.length; funcIdx++) {
    // Skip functions without metadata (not in functionNames map)
    if (!functionNames.has(funcIdx)) {
      continue;
    }

    const funcName = functionNames.get(funcIdx)!;
    const line = functionLines.get(funcIdx)!;
    const funcKey = String(funcIdx);
    const hitCount = coverage.functions[funcKey] || 0;

    // Aggregate by (line, name) to match FN deduplication
    const fnKey = `${line}:${funcName}`;
    const currentCount = fndaAggregated.get(fnKey) || 0;
    fndaAggregated.set(fnKey, currentCount + hitCount);
  }

  // Write FNDA records for each unique function
  for (const [fnKey, hitCount] of fndaAggregated.entries()) {
    const funcName = fnKey.split(':').slice(1).join(':'); // Extract name after line number
    // FNDA:<execution count>,<function name>
    lines.push(`FNDA:${hitCount},${funcName}`);
  }

  // Function summary
  const functionsFound = writtenFunctions.size; // Use deduplicated count
  const functionsHit = Array.from(fndaAggregated.values()).filter(count => count > 0).length;
  lines.push(`FNF:${functionsFound}`);
  lines.push(`FNH:${functionsHit}`);

  // Line coverage (DA records)
  // For function-level coverage, we mark the function start line as covered
  // DA:<line number>,<execution count>

  const lineHits = new Map<number, number>();

  for (let funcIdx = 0; funcIdx < debugInfo.functions.length; funcIdx++) {
    // Skip functions without metadata (not in functionLines map)
    const line = functionLines.get(funcIdx);
    if (line === undefined) continue;

    const funcKey = String(funcIdx);
    const hitCount = coverage.functions[funcKey] || 0;

    // Aggregate hits for the same line (in case multiple functions start on same line)
    const currentHits = lineHits.get(line) || 0;
    lineHits.set(line, currentHits + hitCount);
  }

  // Sort lines for consistent output
  const sortedLines = Array.from(lineHits.keys()).sort((a, b) => a - b);

  for (const line of sortedLines) {
    const hitCount = lineHits.get(line) || 0;
    lines.push(`DA:${line},${hitCount}`);
  }

  // Line summary
  const linesFound = lineHits.size;
  const linesHit = Array.from(lineHits.values()).filter(count => count > 0).length;
  lines.push(`LF:${linesFound}`);
  lines.push(`LH:${linesHit}`);

  // End of record
  lines.push(`end_of_record`);

  return lines.join('\n') + '\n';
}

/**
 * Generate LCOV report for multiple source files
 *
 * @param filesData - Map of source file path to { coverage, debugInfo }
 * @returns Combined LCOV format string
 */
export function generateMultiFileLCOV(
  filesData: Map<string, { coverage: AggregatedCoverage; debugInfo: DebugInfo }>
): string {
  const reports: string[] = [];

  for (const [sourceFile, { coverage, debugInfo }] of filesData.entries()) {
    reports.push(generateLCOV(coverage, debugInfo, sourceFile));
  }

  return reports.join('\n');
}

/**
 * Write coverage report to file
 *
 * Generates LCOV report from collected coverage data and writes to specified path.
 * Creates parent directory if needed.
 *
 * @param coverageMap - Map of source file path to { coverage, debugInfo }
 * @param outputPath - Path to write LCOV file (e.g., 'coverage/lcov.info')
 */
export async function writeCoverageReport(
  coverageMap: Map<string, { coverage: AggregatedCoverage; debugInfo: DebugInfo }>,
  outputPath: string
): Promise<void> {
  debug('[Coverage] Writing combined LCOV report for', coverageMap.size, 'files');

  const lcov = generateMultiFileLCOV(coverageMap);

  // Extract directory path and create if needed
  const lastSlash = outputPath.lastIndexOf('/');
  if (lastSlash !== -1) {
    const dir = outputPath.substring(0, lastSlash);
    await mkdir(dir, { recursive: true });
  }

  await writeFile(outputPath, lcov, 'utf-8');

  debug('[Coverage] LCOV report written to:', outputPath);
}
