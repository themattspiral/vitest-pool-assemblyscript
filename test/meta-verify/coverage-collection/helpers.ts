import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');

const RESULTS_PATH = resolve(PROJECT_ROOT, '.meta-verify-results.json');

// --- Coverage data types ---

export interface FunctionInfo {
  name: string;
  decl: { start: { line: number; column: number }; end: { line: number; column: number } };
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  line: number;
}

export interface FileCoverage {
  path: string;
  fnMap: Record<string, FunctionInfo>;
  f: Record<string, number>;
  statementMap: Record<string, unknown>;
  s: Record<string, number>;
  branchMap: Record<string, unknown>;
  b: Record<string, number>;
}

export type CoverageMap = Record<string, FileCoverage>;

// --- Coverage source file path prefix ---

export const COV_DIR = 'coverage-collection-meta';

// --- Loading ---

export interface CoverageResults {
  coverageMap: CoverageMap;
  coverageEnabled: boolean;
}

/**
 * Load pre-computed meta-verify results and parse the coverage map.
 * Throws if coverage is not enabled or coverage-final.json is missing.
 */
export async function loadCoverageResults(): Promise<CoverageResults> {
  const results = JSON.parse(await readFile(RESULTS_PATH, 'utf-8'));
  const coverageEnabled = results.coverageEnabled;

  let coverageMap: CoverageMap = {};
  if (coverageEnabled) {
    const coveragePath = resolve(results.cwd, 'coverage/meta/coverage-final.json');
    if (!existsSync(coveragePath)) {
      throw new Error(`coverage-final.json not found at ${coveragePath}`);
    }
    coverageMap = JSON.parse(await readFile(coveragePath, 'utf-8'));
  }

  return { coverageMap, coverageEnabled };
}

/**
 * Load the CLI output from the pre-computed meta-verify results.
 */
export async function loadCliOutput(): Promise<string> {
  const results = JSON.parse(await readFile(RESULTS_PATH, 'utf-8'));
  return results.cliOutput;
}

/**
 * Parse a coverage summary table row from CLI output for a given filename.
 * Returns the parsed values, or null if the filename isn't found in the table.
 */
export function parseCoverageTableRow(cliOutput: string, filename: string): CoverageTableRow | null {
  // Strip ANSI escape codes for clean matching
  const clean = cliOutput.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = clean.split('\n');

  const row = lines.find(l => l.includes(filename) && l.includes('|'));
  if (!row) return null;

  // Split on pipe delimiters: File | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
  const parts = row.split('|').map(s => s.trim());
  if (parts.length < 6) return null;

  return {
    filename: parts[0],
    stmts: parseFloat(parts[1]),
    branch: parseFloat(parts[2]),
    funcs: parseFloat(parts[3]),
    lines: parseFloat(parts[4]),
    uncoveredLines: parts[5],
  };
}

export interface CoverageTableRow {
  filename: string;
  stmts: number;
  branch: number;
  funcs: number;
  lines: number;
  uncoveredLines: string;
}

// --- Helpers ---

/**
 * Find a coverage entry by matching the end of its absolute path key.
 * Returns null if no match found.
 */
export function findEntry(map: CoverageMap, pathSuffix: string): FileCoverage | null {
  const key = Object.keys(map).find(k => k.endsWith(pathSuffix));
  return key ? map[key] ?? null : null;
}

/**
 * Find a coverage entry, throwing a descriptive error if not found.
 */
export function requireEntry(map: CoverageMap, pathSuffix: string): FileCoverage {
  const entry = findEntry(map, pathSuffix);
  if (!entry) {
    const available = Object.keys(map)
      .filter(k => k.includes(COV_DIR))
      .map(k => `  - ${k}`)
      .join('\n');
    throw new Error(
      `No coverage entry found ending with "${pathSuffix}".\n` +
      `Available coverage-collection-meta entries:\n${available}`
    );
  }
  return entry;
}

/**
 * Get the hit count for a named function in a coverage entry.
 * Returns undefined if the function is not in fnMap.
 */
export function hitCount(entry: FileCoverage, funcName: string): number | undefined {
  const idx = Object.entries(entry.fnMap).find(([_, fn]) => fn.name === funcName)?.[0];
  return idx !== undefined ? entry.f[idx] : undefined;
}

/**
 * Get all function names in a coverage entry.
 */
export function allFunctionNames(entry: FileCoverage): string[] {
  return Object.values(entry.fnMap).map(fn => fn.name);
}

/**
 * Count how many functions have > 0 hits.
 */
export function coveredCount(entry: FileCoverage): number {
  return Object.values(entry.f).filter(count => count > 0).length;
}

/**
 * Count how many functions have 0 hits.
 */
export function uncoveredCount(entry: FileCoverage): number {
  return Object.values(entry.f).filter(count => count === 0).length;
}

/**
 * Total number of functions in the coverage entry.
 */
export function totalFunctions(entry: FileCoverage): number {
  return Object.keys(entry.fnMap).length;
}

/**
 * Get the FunctionInfo for a named function in a coverage entry.
 * Returns undefined if the function is not in fnMap.
 */
export function functionInfo(entry: FileCoverage, funcName: string): FunctionInfo | undefined {
  return Object.values(entry.fnMap).find(fn => fn.name === funcName);
}
