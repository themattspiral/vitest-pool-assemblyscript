/**
 * Test fixture registry and helpers
 *
 * Auto-discovers all .ts files in test/assembly/ directory.
 * - Dynamic tests (test/dynamic/) run on ALL fixtures
 * - Unit tests (test/unit/) import and use specific fixtures they need
 */

import { resolve, basename } from 'node:path';
import { readdirSync } from 'fs';
import type { BinaryDebugInfo, FunctionDebugInfo } from '../../src/types.js';
import { compileFixture, type CompileResult, type CompileOptions } from './compile-fixture.js';
import { extractDebugInfo } from '../../src/native/addon-interface.js';

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
  debugInfo: BinaryDebugInfo;
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
