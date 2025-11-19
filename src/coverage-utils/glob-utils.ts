/**
 * Glob Utilities for Coverage
 *
 * Uses test-exclude (same as Vitest's v8 coverage provider) to glob
 * AssemblyScript files matching coverage.include patterns.
 */

import { resolve } from 'path';
import TestExclude from 'test-exclude';
import { debug } from '../utils/debug.mjs';

/**
 * Glob AS files matching coverage include/exclude patterns
 *
 * Uses test-exclude for consistent behavior with Vitest's built-in
 * coverage providers.
 *
 * @param include - Include patterns (e.g., ['assembly/**\/*.ts'])
 * @param exclude - Exclude patterns (e.g., ['**\/*.test.ts'])
 * @param projectRoot - Project root directory
 * @returns Array of absolute file paths
 */
export async function globAsFiles(
  include: string[],
  exclude: string[],
  projectRoot: string
): Promise<string[]> {
  debug(`[GlobUtils] Globbing AS files in ${projectRoot}`);
  debug(`[GlobUtils] Include patterns: ${include.join(', ')}`);
  debug(`[GlobUtils] Exclude patterns: ${exclude.join(', ')}`);

  const testExclude = new TestExclude({
    cwd: projectRoot,
    include,
    exclude,
    // Don't use default excludes (node_modules, etc.) - let user control via exclude
    excludeNodeModules: true,
  });

  const allFiles = await testExclude.glob(projectRoot);

  // Convert to absolute paths
  // test-exclude.glob() returns relative paths from cwd
  const asFiles = allFiles.map((file: string) => resolve(projectRoot, file));

  debug(`[GlobUtils] Found ${asFiles.length} AS files`);

  return asFiles;
}
