import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');

const RESULTS_PATH = resolve(PROJECT_ROOT, 'tmp/.meta-verify-results.json');

// --- Coverage enabled check (mirrors global-setup-capture-meta-run.ts logic) ---

/** Whether coverage data is available in this run context. */
export const COVERAGE_ENABLED: boolean = process.env.RUN_CONTEXT !== 'external_no_coverage';

// --- Meta run results types (from vitest JSON reporter) ---

export interface TestResult {
  status: 'passed' | 'failed' | 'skipped';
  title: string;
  fullName: string;
  ancestorTitles: string[];
  duration: number;
  failureMessages: string[];
}

export interface TestFileResult {
  name: string;
  status: 'passed' | 'failed';
  message: string;
  assertionResults: TestResult[];
}

export interface MetaRunResults {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numPendingTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: TestFileResult[];
}

// --- Coverage data types (from coverage-final.json / Istanbul format) ---

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

export interface CoverageResults {
  coverageMap: CoverageMap;
}

export const COV_DIR = 'coverage-collection-meta';

export interface CoverageTableRow {
  filename: string;
  stmts: number;
  branch: number;
  funcs: number;
  lines: number;
  uncoveredLines: string;
}

// --- Loading ---

/**
 * Load the meta run results (vitest JSON reporter output) from the pre-computed results file.
 */
export async function loadMetaRunResults(): Promise<MetaRunResults> {
  const results = JSON.parse(await readFile(RESULTS_PATH, 'utf-8'));
  return results.jsonOutput;
}

/**
 * Load the CLI output from the pre-computed meta-verify results.
 */
export async function loadCliOutput(): Promise<string> {
  const results = JSON.parse(await readFile(RESULTS_PATH, 'utf-8'));
  return results.cliOutput;
}

/**
 * Load pre-computed meta-verify results and parse the coverage map.
 * Throws if coverage is not enabled or coverage-final.json is missing.
 */
export async function loadCoverageResults(): Promise<CoverageResults> {
  const results = JSON.parse(await readFile(RESULTS_PATH, 'utf-8'));

  let coverageMap: CoverageMap = {};
  if (COVERAGE_ENABLED) {
    const coveragePath = resolve(results.cwd, 'coverage/meta/coverage-final.json');
    if (!existsSync(coveragePath)) {
      throw new Error(`coverage-final.json not found at ${coveragePath}`);
    }
    coverageMap = JSON.parse(await readFile(coveragePath, 'utf-8'));
  }

  return { coverageMap };
}

// --- Meta run results helpers ---

/**
 * Find a test file result by matching the end of its absolute path.
 * Returns null if no match found.
 */
export function findTestFile(metaRunResults: MetaRunResults, pathSuffix: string): TestFileResult | null {
  return metaRunResults.testResults.find(tr => tr.name.endsWith(pathSuffix)) ?? null;
}

/**
 * Find a test file result, throwing a descriptive error if not found.
 */
export function requireTestFile(metaRunResults: MetaRunResults, pathSuffix: string): TestFileResult {
  const file = findTestFile(metaRunResults, pathSuffix);
  if (!file) {
    const available = metaRunResults.testResults
      .map(tr => `  - ${tr.name}`)
      .join('\n');
    throw new Error(
      `No test file found ending with "${pathSuffix}".\n` +
      `Available test files:\n${available}`
    );
  }
  return file;
}

/**
 * Find a test result by title within a test file's assertionResults.
 * Returns null if no match found.
 */
export function findTest(testFile: TestFileResult, title: string): TestResult | null {
  return testFile.assertionResults.find(ar => ar.title === title) ?? null;
}

/**
 * Find a test result by title, throwing a descriptive error if not found.
 */
export function requireTest(testFile: TestFileResult, title: string): TestResult {
  const test = findTest(testFile, title);
  if (!test) {
    const available = testFile.assertionResults
      .map(ar => `  - [${ar.status}] ${ar.title}`)
      .join('\n');
    throw new Error(
      `No test found with title "${title}" in ${testFile.name}.\n` +
      `Available tests:\n${available}`
    );
  }
  return test;
}

/**
 * Count tests by status within a test file.
 */
export function countByStatus(testFile: TestFileResult, status: TestResult['status']): number {
  return testFile.assertionResults.filter(ar => ar.status === status).length;
}

// --- Coverage helpers ---

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

  // Destructure with defaults to narrow string | undefined → string
  // (the length check above guarantees all 6 elements exist)
  const [
    fileCell = '',
    stmtsStr = '',
    branchStr = '',
    funcsStr = '',
    linesStr = '',
    uncoveredLines = '',
  ] = parts;

  return {
    filename: fileCell,
    stmts: parseFloat(stmtsStr),
    branch: parseFloat(branchStr),
    funcs: parseFloat(funcsStr),
    lines: parseFloat(linesStr),
    uncoveredLines,
  };
}
