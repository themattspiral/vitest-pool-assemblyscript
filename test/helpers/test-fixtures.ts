/**
 * Test fixture registry and helpers
 *
 * Auto-discovers all .ts files in test/assembly/ directory.
 * - Dynamic tests (test/dynamic/) run on ALL fixtures
 * - Unit tests (test/unit/) import and use specific fixtures they need
 */

import { resolve, basename } from 'path';
import { readdirSync } from 'fs';
import { compileFixture, type CompileResult, type CompileOptions } from './compile-fixture.js';
import { extractDebugInfo } from '../../src/native/addon-interface.js';
import type { DebugInfo, FunctionDebugInfo } from '../../src/native/addon-types';

/**
 * Path prefix used in source maps and function names for test fixtures
 * Export this for use in tests that need to filter by fixture path
*/
export const FIXTURE_PATH_PREFIX = 'test-fixtures/assembly/';

// Get test/assembly directory
const ASSEMBLY_DIR = resolve(import.meta.dirname, `../../${FIXTURE_PATH_PREFIX}`);

/**
 * Test fixture definition
 */
export interface TestFixture {
  /** Fixture name (without .ts extension) */
  name: string;
  /** Full path to the AS source file */
  path: string;
}

/**
 * Compiled test fixture with debug info
 */
export interface CompiledFixture {
  /** Fixture metadata */
  fixture: TestFixture;
  /** Compilation result */
  compiled: CompileResult;
  /** Extracted debug info */
  debugInfo: DebugInfo;
  /** Source code lines */
  sourceLines: string[];
}

/**
 * Auto-discover all .ts files
 */
function discoverFixtures(): Record<string, TestFixture> {
  const fixtures: Record<string, TestFixture> = {};

  try {
    const files = readdirSync(ASSEMBLY_DIR);

    for (const file of files) {
      if (!file.endsWith('.ts')) continue;

      const name = basename(file, '.ts');
      const path = resolve(ASSEMBLY_DIR, file);

      fixtures[name] = {
        name,
        path,
      };
    }
  } catch (err) {
    console.warn(`Warning: ${ASSEMBLY_DIR} directory not found, no fixtures loaded`);
  }

  return fixtures;
}

/**
 * Get all fixtures (for dynamic test harness)
 */
export function getAllFixtures(): TestFixture[] {
  return Object.values(discoverFixtures());
}

/**
 * Compile a fixture and extract debug info
 */
export async function compileAndExtract(
  fixture: TestFixture,
  options: CompileOptions = { writeFiles: false }
): Promise<CompiledFixture> {
  const compiled = await compileFixture(fixture.path, options);

  if (!compiled.success) {
    throw new Error(`Failed to compile ${fixture.name}: ${compiled.stderr}`);
  }

  if (!compiled.sourceMap) {
    throw new Error(`No source map generated for ${fixture.name}`);
  }

  const debugInfo = extractDebugInfo(compiled.binary, compiled.sourceMap);

  // Read source lines
  const { readFileSync } = await import('fs');
  const sourceCode = readFileSync(fixture.path, 'utf-8');
  const sourceLines = sourceCode.split('\n');

  return {
    fixture,
    compiled,
    debugInfo,
    sourceLines,
  };
}

/**
 * Compile multiple fixtures
 */
export async function compileFixtures(
  fixtures: TestFixture[],
  options: CompileOptions = { writeFiles: false }
): Promise<CompiledFixture[]> {
  return Promise.all(fixtures.map(f => compileAndExtract(f, options)));
}

/**
 * Helper to get functions from our test source (not stdlib)
 */
export function getTestFunctionNames(debugInfo: DebugInfo, fixtureName: string): string[] {
  return Object.keys(debugInfo.functions).filter(name =>
    name.includes(`${FIXTURE_PATH_PREFIX}${fixtureName}`)
  );
}

/**
 * Helper to find a specific function by name fragment
 */
export function findFunctionByName(debugInfo: DebugInfo, nameFragment: string): [string, FunctionDebugInfo] | undefined {
  const entry = Object.entries(debugInfo.functions).find(([name]) =>
    name.includes(nameFragment)
  );
  return entry;
}

/**
 * Helper to get expressions that map to our source file (not stdlib)
 */
export function getTestFileExpressions(
  debugInfo: DebugInfo,
  funcName: string,
  fixtureName: string
) {
  const func = debugInfo.functions[funcName];
  if (!func) return [];

  return func.expressions
    .map((expr, index) => ({ expr, index }))
    .filter(({ expr }) => expr.location)
    .map(({ expr, index }) => ({
      expr,
      index,
      location: expr.location!,
    }))
    .filter(({ location }) => {
      const fileName = debugInfo.debugFiles[location.fileIndex];
      return fileName.includes(`${FIXTURE_PATH_PREFIX}${fixtureName}`);
    });
}
