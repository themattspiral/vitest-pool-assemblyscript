/**
 * Test fixture registry and helpers
 *
 * Auto-discovers all .ts files in test/assembly/ directory.
 * - Dynamic tests (test/dynamic/) run on ALL fixtures
 * - Unit tests (test/unit/) import and use specific fixtures they need
 */

import { resolve, basename } from 'node:path';
import { readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import {
  AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
  AS_POOL_WASM_IMPORTS_MODULE_NAME,
  ASSEMBLYSCRIPT_LIB_PREFIX,
  INTERNAL_FUNCTION_NAME_SUBSTRING,
  POOL_INTERNAL_PATHS,
} from '../../../../src/types/constants.js';
import type { WASMCompilation } from '../../../../src/types/types.js';

// test with compiled version because asc strip-inline transform needs transpilation
//@ts-ignore
import { compileAssemblyScript as casDist } from '../../../../dist/index-internal.mjs';
import { compileAssemblyScript as casSrc } from '../../../../src/index-internal.js';
//@ts-ignore
const compileAssemblyScript: typeof casSrc = casDist;

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const FIXTURE_PATH_PREFIX = 'test/assembly/';
const ASSEMBLY_DIR = resolve(PROJECT_ROOT, FIXTURE_PATH_PREFIX);

/**
 * Test fixture definition
 */
export interface TestFixture {
  relPath: string;
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
  compilation: WASMCompilation;
  /** Source code lines */
  sourceLines: string[];
}

/**
 * Auto-discover all .ts files
 */
function discoverFixtures(): Record<string, TestFixture> {
  const fixtures: Record<string, TestFixture> = {};

  try {
    const files = readdirSync(ASSEMBLY_DIR, { recursive: true });

    for (const file of files) {
      if (typeof file !== 'string' ) continue;
      if (!file.endsWith('.ts')) continue;

      const name = basename(file, '.ts');
      const path = resolve(ASSEMBLY_DIR, file);

      fixtures[name] = {
        relPath: FIXTURE_PATH_PREFIX + file,
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
): Promise<CompiledFixture> {
  const compilePromise =  compileAssemblyScript(
    fixture.path,
    {
      shouldInstrument: true,
      stripInline: true,
      projectRoot: PROJECT_ROOT,
      instrumentationOptions: {
        projectRoot: PROJECT_ROOT,
        relativeExcludedFiles: [fixture.relPath].concat(POOL_INTERNAL_PATHS),
        excludedLibraryFilePrefix: ASSEMBLYSCRIPT_LIB_PREFIX,
        excludedInternalFunctionSubstring: INTERNAL_FUNCTION_NAME_SUBSTRING,
        coverageMemoryModule: AS_POOL_WASM_IMPORTS_MODULE_NAME,
        coverageMemoryName: AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
      },
    },
    'test',
    fixture.relPath
  );
  const sourceCodePromise = readFile(fixture.path, 'utf-8');
  
  const [compilation, sourceCode] = await Promise.all([compilePromise, sourceCodePromise]);

  return {
    fixture,
    compilation,
    sourceLines: sourceCode.split('\n'),
  };
}
