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
    functions: new Map(),
    blocks: new Map(),
  };

  for (const coverage of coverageDataList) {
    // Aggregate function coverage
    for (const [funcIdx, count] of coverage.functions.entries()) {
      const current = aggregated.functions.get(funcIdx) || 0;
      aggregated.functions.set(funcIdx, current + count);
    }

    // Aggregate block coverage
    for (const [blockKey, count] of coverage.blocks.entries()) {
      const current = aggregated.blocks.get(blockKey) || 0;
      aggregated.blocks.set(blockKey, current + count);
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

  debugInfo.functions.forEach((funcInfo, funcIdx) => {
    const funcName = funcInfo.name;
    const line = funcInfo.startLine || 1; // Use startLine, fallback to 1 for functions without metadata

    functionNames.set(funcIdx, funcName);
    functionLines.set(funcIdx, line);

    // FN:<line>,<function name>
    lines.push(`FN:${line},${funcName}`);
  });

  // Function execution data (FNDA records)
  for (let funcIdx = 0; funcIdx < debugInfo.functions.length; funcIdx++) {
    const funcName = functionNames.get(funcIdx) || `func_${funcIdx}`;
    const hitCount = coverage.functions.get(funcIdx) || 0;

    // FNDA:<execution count>,<function name>
    lines.push(`FNDA:${hitCount},${funcName}`);
  }

  // Function summary
  const functionsFound = debugInfo.functions.length;
  const functionsHit = Array.from(coverage.functions.values()).filter(count => count > 0).length;
  lines.push(`FNF:${functionsFound}`);
  lines.push(`FNH:${functionsHit}`);

  // Line coverage (DA records)
  // For function-level coverage, we mark the function start line as covered
  // DA:<line number>,<execution count>

  const lineHits = new Map<number, number>();

  for (let funcIdx = 0; funcIdx < debugInfo.functions.length; funcIdx++) {
    const line = functionLines.get(funcIdx);
    if (line === undefined) continue;

    const hitCount = coverage.functions.get(funcIdx) || 0;

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
