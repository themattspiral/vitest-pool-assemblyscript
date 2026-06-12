import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');

const RESULTS_PATH = resolve(PROJECT_ROOT, 'tmp/.meta-verify-results.json');

const isExternalContext = process.env.RUN_CONTEXT === 'external';

export const COVERAGE_ENABLED = true;

/**
 * Path prefix for test file paths in CLI output.
 * In external context, vitest runs from a sibling directory and reports file paths
 * relative to that directory, producing paths like '../vitest-pool-assemblyscript/test/...'.
 * In local context, paths are relative to the pool repo root: 'test/...'.
 */
export const TEST_FILE_PREFIX: string = isExternalContext ? '../vitest-pool-assemblyscript/' : '';

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
  /** Directory-qualified path (e.g. 'assembly-src/coverage-collection-meta/math-helpers.meta.ts') */
  filename: string;
  stmts: number;
  branch: number;
  funcs: number;
  lines: number;
  uncoveredLines: string;
}

// --- Pre-parsed CLI output ---

/**
 * Pre-parsed CLI output with indexed structures for efficient lookups.
 * All ANSI codes are stripped during parsing — consumers don't need to handle them.
 */
export interface ParsedCliOutput {
  /**
   * Test reporting output: the CLI content before the error blocks section.
   * Contains test result lines (✓/✗), file summaries, and retry annotations.
   * ANSI codes are already stripped. Useful for ad-hoc searches on test result
   * details that aren't pre-parsed into structures (e.g. retry counts on passing tests).
   */
  testReportOutput: string;

  /**
   * Error blocks keyed by the full test path from the FAIL header.
   * Format: 'filepath > suite > testName'
   *
   * The value is an array because the same test path can appear in multiple
   * blocks if a retried test produces different errors across attempts
   * (different error.stack values → vitest creates separate error blocks).
   * For non-retried tests, the array always has exactly one entry.
   */
  errorBlocks: Map<string, string[]>;

  /**
   * Coverage table rows keyed by directory-qualified path.
   * Format: 'directory/filename.ts'
   *
   * Lookup via requireCoverageTableRow uses suffix matching with uniqueness
   * validation, so callers can pass just a filename for unique entries or
   * include directory context to disambiguate collisions.
   */
  coverageTableRows: Map<string, CoverageTableRow>;
}

// --- CLI parsing internals ---

// Separator lines: "⎯⎯⎯[N/M]⎯", "⎯⎯⎯ Failed Tests N ⎯⎯⎯", etc.
const SEPARATOR_LINE = /^[⎯─]{3,}/;

// FAIL header: " FAIL   <project>  <test-path>"
// The reporter constructs this from file.name + ' > ' + getTestName(task)
// (see vitest base.ts getFullName and @vitest/runner/utils getTestName)
const FAIL_HEADER = /^ FAIL\s+\S+\s+(.+)/;

// Coverage table header row
const COVERAGE_TABLE_HEADER = /^\s*File\s+\|\s*% Stmts/;

// Coverage table separator (dashed lines between header and data)
const COVERAGE_TABLE_SEPARATOR = /^-{3,}/;

/**
 * Parse error blocks from ANSI-stripped CLI output lines.
 *
 * Vitest's default reporter groups errors between separator lines (⎯⎯⎯[N/M]⎯).
 * Each block starts with one or more FAIL header lines, followed by error content.
 * Multiple FAIL headers in a block occur when:
 * - A test is retried and all attempts produce the same error.stack (deduplication)
 * - Different tests produce the same error.stack (cross-test deduplication)
 *
 * Returns a map of full test path → array of block content strings.
 */
function parseErrorBlocks(lines: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  let i = 0;
  while (i < lines.length) {
    // Scan for a separator line
    if (!SEPARATOR_LINE.test(lines[i]!)) {
      i++;
      continue;
    }

    // Found a separator — skip past it and any blank lines
    i++;
    while (i < lines.length && lines[i]!.trim() === '') {
      i++;
    }

    // Check if the next non-blank line is a FAIL header
    if (i >= lines.length || !FAIL_HEADER.test(lines[i]!)) {
      continue;
    }

    // Collect all consecutive FAIL headers (retries/dedup share a block)
    const blockStartIdx = i;
    const testPaths = new Set<string>();

    while (i < lines.length && FAIL_HEADER.test(lines[i]!)) {
      const match = lines[i]!.match(FAIL_HEADER);
      if (match && match[1]) {
        testPaths.add(match[1].trimEnd());
      }
      i++;
    }

    // Collect remaining content until the next separator
    while (i < lines.length && !SEPARATOR_LINE.test(lines[i]!)) {
      i++;
    }

    // Build the full block content (FAIL headers + error details)
    const blockContent = lines.slice(blockStartIdx, i).join('\n');

    // Map each unique test path to this block
    for (const path of testPaths) {
      const existing = map.get(path);
      if (existing) {
        existing.push(blockContent);
      } else {
        map.set(path, [blockContent]);
      }
    }
  }

  return map;
}

/**
 * Parse the coverage summary table from ANSI-stripped CLI output lines.
 *
 * Istanbul's text reporter uses indentation to group files by directory:
 * - 1 space indent = directory row (sets directory context for subsequent files)
 * - 2 space indent = file row (belongs to the most recent directory)
 *
 * Returns a map keyed by directory-qualified path (e.g. 'dir/subdir/file.ts').
 */
function parseCoverageTable(lines: string[]): Map<string, CoverageTableRow> {
  const map = new Map<string, CoverageTableRow>();

  // Find the coverage table header row
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (COVERAGE_TABLE_HEADER.test(lines[i]!)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return map;

  // Walk data rows after the header, tracking directory context
  let currentDir = '';
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;

    // Stop at the closing separator line (dashes)
    if (COVERAGE_TABLE_SEPARATOR.test(line)) {
      // Skip separator rows between header and data (the one right after the header)
      // but stop at the closing separator (which comes after data rows)
      if (map.size > 0) break;
      continue;
    }

    // Must be a pipe-delimited row
    const firstPipeIdx = line.indexOf('|');
    if (firstPipeIdx === -1) continue;

    // Extract raw file cell BEFORE splitting/trimming to preserve leading
    // whitespace — istanbul uses indentation to distinguish directory vs file rows
    const rawFileCell = line.substring(0, firstPipeIdx);
    const trimmedCell = rawFileCell.trim();

    // Parse value columns from everything after the first pipe
    const valueParts = line.substring(firstPipeIdx + 1).split('|').map(s => s.trim());
    if (valueParts.length < 5) continue;

    // Skip the "All files" aggregate row
    if (trimmedCell === 'All files') continue;

    // Determine row type by leading space count in the raw file cell
    const leadingSpaces = rawFileCell.length - rawFileCell.trimStart().length;

    if (leadingSpaces <= 1) {
      // Directory row — update context for subsequent file rows
      currentDir = trimmedCell;
      continue;
    }

    // File row (2+ spaces indent) — parse and store with directory-qualified key
    const qualifiedPath = currentDir ? `${currentDir}/${trimmedCell}` : trimmedCell;

    const [
      stmtsStr = '',
      branchStr = '',
      funcsStr = '',
      linesStr = '',
      uncoveredLines = '',
    ] = valueParts;

    map.set(qualifiedPath, {
      filename: qualifiedPath,
      stmts: parseFloat(stmtsStr),
      branch: parseFloat(branchStr),
      funcs: parseFloat(funcsStr),
      lines: parseFloat(linesStr),
      uncoveredLines,
    });
  }

  return map;
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
 * Load and parse CLI output from the pre-computed meta-verify results.
 * Strips ANSI escape codes once and parses into indexed structures for
 * efficient lookups of error blocks and coverage table rows.
 */
export async function loadParsedCliOutput(): Promise<ParsedCliOutput> {
  const results = JSON.parse(await readFile(RESULTS_PATH, 'utf-8'));
  const rawCliOutput: string = results.cliOutput;

  // Strip VT control characters once for all parsing
  const cleanOutput = stripVTControlCharacters(rawCliOutput);
  const lines = cleanOutput.split('\n');

  // Find the boundary where error blocks begin (first separator followed by FAIL header).
  // Everything before this is the test reporting output.
  let errorBlockBoundary = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (!SEPARATOR_LINE.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() === '') j++;
    if (j < lines.length && FAIL_HEADER.test(lines[j]!)) {
      errorBlockBoundary = i;
      break;
    }
  }

  return {
    testReportOutput: lines.slice(0, errorBlockBoundary).join('\n'),
    errorBlocks: parseErrorBlocks(lines),
    coverageTableRows: parseCoverageTable(lines),
  };
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

// --- CLI error block lookup ---

/**
 * Get the error block for a specific failed test by its full test path.
 *
 * The full test path matches the FAIL header format from vitest's default reporter:
 * 'filepath > suite > testName' (e.g. 'test/assembly/file.meta.test.ts > toBe > integer [should fail]')
 *
 * Throws if the test path is not found, or if the same test path appears in
 * multiple distinct error blocks (which would indicate different errors across
 * retries — callers needing to inspect this case should use parsed.errorBlocks directly).
 */
export function requireErrorBlock(parsed: ParsedCliOutput, fullTestPath: string): string {
  const blocks = parsed.errorBlocks.get(fullTestPath);

  if (!blocks || blocks.length === 0) {
    const available = [...parsed.errorBlocks.keys()]
      .map(k => `  - ${k}`)
      .join('\n');
    throw new Error(
      `No error block found for test path "${fullTestPath}".\n` +
      `The test may not have failed, or the path may not match exactly.\n` +
      `Available error block keys:\n${available}`
    );
  }

  if (blocks.length > 1) {
    throw new Error(
      `Multiple error blocks (${blocks.length}) found for test path "${fullTestPath}".\n` +
      `This indicates different errors across retries. Use parsed.errorBlocks.get() directly to inspect them.`
    );
  }

  return blocks[0] as string;
}

// --- CLI coverage table lookup ---

/**
 * Look up a coverage table row by path suffix with uniqueness validation.
 *
 * Searches directory-qualified keys (e.g. 'assembly-src/coverage-collection-meta/file.ts')
 * by suffix matching. Callers can pass just a filename for unique entries or
 * include directory context to disambiguate (e.g. 'edge/math-helpers.meta.ts').
 *
 * Throws on zero matches (not found) or multiple matches (ambiguous suffix).
 */
export function requireCoverageTableRow(parsed: ParsedCliOutput, pathSuffix: string): CoverageTableRow {
  const matches = [...parsed.coverageTableRows.entries()]
    .filter(([key]) => key.endsWith(pathSuffix));

  if (matches.length === 0) {
    const available = [...parsed.coverageTableRows.keys()]
      .map(k => `  - ${k}`)
      .join('\n');
    throw new Error(
      `No coverage table row found matching suffix "${pathSuffix}".\n` +
      `Available entries:\n${available}`
    );
  }

  if (matches.length > 1) {
    const matched = matches.map(([k]) => `  - ${k}`).join('\n');
    throw new Error(
      `Ambiguous coverage table lookup: "${pathSuffix}" matches ${matches.length} entries:\n${matched}\n` +
      `Use a more specific suffix to disambiguate.`
    );
  }

  return matches[0]![1];
}

// --- Meta run results helpers ---

/**
 * Find a test file result by suffix-matching its absolute path.
 * Validates that exactly one entry matches. Returns null if no match found.
 * Throws if multiple entries match (ambiguous suffix).
 */
export function findTestFile(metaRunResults: MetaRunResults, pathSuffix: string): TestFileResult | null {
  const matches = metaRunResults.testResults.filter(tr => tr.name.endsWith(pathSuffix));

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    const matched = matches.map(tr => `  - ${tr.name}`).join('\n');
    throw new Error(
      `Ambiguous test file lookup: "${pathSuffix}" matches ${matches.length} files:\n${matched}\n` +
      `Use a more specific suffix to disambiguate.`
    );
  }

  return matches[0] as TestFileResult;
}

/**
 * Find a test file result by suffix, throwing a descriptive error if not found.
 * Also throws if multiple entries match (ambiguous suffix).
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
 * Build the full test path from a test result's ancestor titles and title.
 * Skips the first ancestor (always the file path) and joins the remaining
 * describe names with the test title using ' > ' separators.
 *
 * Examples:
 *   - Top-level test: `'my test'`
 *   - Nested test: `'suite > nested > my test'`
 */
function testResultPath(ar: TestResult): string {
  const suites = ar.ancestorTitles.slice(1);
  return [...suites, ar.title].join(' > ');
}

/**
 * Find a test result by its full path within a test file's assertionResults.
 * The path is matched against ancestor describe names + test title joined
 * with ' > ' separators. For top-level tests (no describes), the path is
 * just the test title.
 *
 * Returns null if no match found.
 */
export function findTest(testFile: TestFileResult, testPath: string): TestResult | null {
  return testFile.assertionResults.find(ar => testResultPath(ar) === testPath) ?? null;
}

/**
 * Find a test result by its full path, throwing a descriptive error if not found.
 * See {@link findTest} for path format.
 */
export function requireTest(testFile: TestFileResult, testPath: string): TestResult {
  const test = findTest(testFile, testPath);
  if (!test) {
    const available = testFile.assertionResults
      .map(ar => `  - [${ar.status}] ${testResultPath(ar)}`)
      .join('\n');
    throw new Error(
      `No test found matching "${testPath}" in ${testFile.name}.\n` +
      `Available tests (full paths):\n${available}`
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
 * Find a coverage entry by suffix-matching its absolute path key.
 * Validates that exactly one entry matches. Returns null if no match found.
 * Throws if multiple entries match (ambiguous suffix).
 */
export function findEntry(map: CoverageMap, pathSuffix: string): FileCoverage | null {
  const matches = Object.keys(map).filter(k => k.endsWith(pathSuffix));

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    const matched = matches.map(k => `  - ${k}`).join('\n');
    throw new Error(
      `Ambiguous coverage entry lookup: "${pathSuffix}" matches ${matches.length} entries:\n${matched}\n` +
      `Use a more specific suffix to disambiguate.`
    );
  }

  return map[matches[0]!] ?? null;
}

/**
 * Find a coverage entry by suffix, throwing a descriptive error if not found.
 * Also throws if multiple entries match (ambiguous suffix).
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
