import { resolve, basename } from 'node:path';
import { readdirSync } from 'fs';
import type { WASMCompilation } from '../../../../src/types/types.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../../..');
const FIXTURE_PATH_PREFIX = 'test/assembly/';
const ASSEMBLY_DIR = resolve(PROJECT_ROOT, FIXTURE_PATH_PREFIX);

/**
 * Test fixture definition
 */
export interface TestFixture {
  relPath: string;
  /** Fixture name (WITHOUT .ts extension) */
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
      if (!file.endsWith('.test.ts')) continue;

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
